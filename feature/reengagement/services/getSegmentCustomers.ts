"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";
import type {
  ReengagementSegment,
  SegmentCustomer,
} from "../types";

/**
 * 指定セグメントに該当する顧客を返す。
 *
 * 集計は Supabase のクエリ結果 + in-memory フィルタで構成する。
 * 顧客数は 1 店舗あたり数千規模を想定。N+1 は避け、1 顧客あたり
 * 最大 2 クエリに留める。
 *
 * - first_visit_30d : last_visit_date が 14〜30 日前 AND visit_count = 1
 *                     AND 未来予約がない
 * - dormant_60d     : last_visit_date <= today-60 AND 未来予約がない
 * - plan_expired    : customer_plans で status IN (1,2) かつ updated_at が
 *                     直近 30 日以内、かつ同顧客に active な plan が無い、
 *                     かつ満了後の来店がない
 *
 * 既に同セグメントで cooldown 期間内に送信済の顧客には lastSentAt を
 * 立てて UI に表示する (呼び出し側でスキップ判定に使う)。
 */
export async function getSegmentCustomers(
  shopId: number,
  segment: ReengagementSegment,
  cooldownDays: number
): Promise<SegmentCustomer[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = toLocalDateString(today);

  // --- 1. セグメントごとに候補顧客を絞る --------------------------------
  type Candidate = {
    id: number;
    code: string | null;
    last_name: string | null;
    first_name: string | null;
    last_visit_date: string | null;
    visit_count: number | null;
    line_user_id: string | null;
    email: string | null;
    phone_number_1: string | null;
    note: string | null;
  };
  let candidates: Candidate[] = [];

  if (segment === "first_visit_30d") {
    const start = daysAgo(todayStr, 30);
    const end = daysAgo(todayStr, 14);
    const { data } = await supabase
      .from("customers")
      .select(
        "id, code, last_name, first_name, last_visit_date, visit_count, line_user_id, email, phone_number_1"
      )
      .eq("shop_id", shopId)
      .eq("visit_count", 1)
      .gte("last_visit_date", start)
      .lte("last_visit_date", end)
      .is("deleted_at", null);
    candidates = ((data ?? []) as Candidate[]).map((c) => ({
      ...c,
      note: `初回: ${c.last_visit_date ?? "-"}`,
    }));
  } else if (segment === "dormant_60d") {
    const end = daysAgo(todayStr, 60);
    const { data } = await supabase
      .from("customers")
      .select(
        "id, code, last_name, first_name, last_visit_date, visit_count, line_user_id, email, phone_number_1"
      )
      .eq("shop_id", shopId)
      .lte("last_visit_date", end)
      .gt("visit_count", 0)
      .is("deleted_at", null);
    candidates = ((data ?? []) as Candidate[]).map((c) => ({
      ...c,
      note: `最終来院: ${c.last_visit_date ?? "-"}`,
    }));
  } else if (segment === "plan_expired") {
    // plan 満了の定義: 直近 30 日以内に status が 1/2 になったプラン
    // があり、同顧客に active (status=0) なプランが無いこと。
    const since = daysAgo(todayStr, 30);
    const { data: expiredPlans } = await supabase
      .from("customer_plans")
      .select(
        "customer_id, menu_name_snapshot, updated_at, plan_type, total_count, used_count"
      )
      .eq("shop_id", shopId)
      .in("status", [1, 2])
      .gte("updated_at", `${since}T00:00:00+09:00`)
      .is("deleted_at", null);

    const expiredByCustomer = new Map<
      number,
      { menuName: string; updatedAt: string; planType: string }
    >();
    for (const p of (expiredPlans ?? []) as Array<{
      customer_id: number;
      menu_name_snapshot: string;
      updated_at: string;
      plan_type: string;
    }>) {
      // 同顧客に複数あれば一番新しいものを残す
      const existing = expiredByCustomer.get(p.customer_id);
      if (!existing || existing.updatedAt < p.updated_at) {
        expiredByCustomer.set(p.customer_id, {
          menuName: p.menu_name_snapshot,
          updatedAt: p.updated_at,
          planType: p.plan_type,
        });
      }
    }

    if (expiredByCustomer.size === 0) return [];

    // 同顧客に active なプランがある場合は除外
    const { data: activePlans } = await supabase
      .from("customer_plans")
      .select("customer_id")
      .in("customer_id", Array.from(expiredByCustomer.keys()))
      .eq("status", 0)
      .is("deleted_at", null);
    const activeSet = new Set(
      (activePlans ?? []).map(
        (p: { customer_id: number }) => p.customer_id
      )
    );

    const targetIds = Array.from(expiredByCustomer.keys()).filter(
      (id) => !activeSet.has(id)
    );
    if (targetIds.length === 0) return [];

    const { data } = await supabase
      .from("customers")
      .select(
        "id, code, last_name, first_name, last_visit_date, visit_count, line_user_id, email, phone_number_1"
      )
      .in("id", targetIds)
      .eq("shop_id", shopId)
      .is("deleted_at", null);
    candidates = ((data ?? []) as Candidate[]).map((c) => {
      const e = expiredByCustomer.get(c.id);
      return {
        ...c,
        note: e
          ? `満了: ${e.menuName} (${e.updatedAt.slice(0, 10)})`
          : null,
      };
    });
  }

  if (candidates.length === 0) return [];

  // --- 2. 未来予約がある顧客を除外 --------------------------------------
  //   plan_expired では「満了後に来店あり」を除外するのが妥当なので、
  //   first_visit_30d / dormant_60d と共通ロジックで未来予約 + status=0
  //   (待機) / 1 (施術中) があれば target から外す。
  const candidateIds = candidates.map((c) => c.id);
  const { data: futureAppts } = await supabase
    .from("appointments")
    .select("customer_id")
    .in("customer_id", candidateIds)
    .eq("shop_id", shopId)
    .gte("start_at", `${todayStr}T00:00:00+09:00`)
    .is("deleted_at", null)
    .in("status", [0, 1]);
  const hasFuture = new Set(
    (futureAppts ?? []).map(
      (a: { customer_id: number }) => a.customer_id
    )
  );

  const filtered = candidates.filter((c) => !hasFuture.has(c.id));
  if (filtered.length === 0) return [];

  // --- 3. cooldown 判定用に直近の送信ログを引く --------------------------
  const cooldownStart = daysAgo(todayStr, cooldownDays);
  const { data: recentLogs } = await supabase
    .from("reengagement_logs")
    .select("customer_id, sent_at")
    .in(
      "customer_id",
      filtered.map((c) => c.id)
    )
    .eq("segment", segment)
    .gte("sent_at", `${cooldownStart}T00:00:00+09:00`)
    .order("sent_at", { ascending: false });

  const lastSentByCustomer = new Map<number, string>();
  for (const row of (recentLogs ?? []) as Array<{
    customer_id: number;
    sent_at: string;
  }>) {
    if (!lastSentByCustomer.has(row.customer_id)) {
      lastSentByCustomer.set(row.customer_id, row.sent_at);
    }
  }

  // --- 4. SegmentCustomer にマップ --------------------------------------
  return filtered.map((c) => ({
    id: c.id,
    code: c.code ?? null,
    name:
      [c.last_name, c.first_name].filter(Boolean).join(" ") || "(名前なし)",
    lastVisitDate: c.last_visit_date,
    visitCount: c.visit_count ?? 0,
    lineUserId: c.line_user_id,
    email: c.email,
    phone: c.phone_number_1,
    lastSentAt: lastSentByCustomer.get(c.id) ?? null,
    note: c.note,
  }));
}

function daysAgo(todayStr: string, n: number): string {
  const d = new Date(todayStr + "T00:00:00");
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
