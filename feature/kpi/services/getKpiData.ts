"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

/**
 * KPI dashboard aggregation service.
 *
 * Powers /kpi (経営指標). One shop, one date range, optional staff filter.
 *
 * Metrics:
 *  - 総売上 / 新規売上 / 継続売上: sum(sales) where status=2, split by
 *    プラン購入の最古/2回目以降 (getDailyReport と同じロジック)
 *  - 総新規数: 期間内に「人生最古の status=2 予約」が立った顧客の
 *    ユニーク数 (true-new attribution, visit_count スタンプには依存しない)
 *  - 入会率: 新規顧客のうち、ライフタイムで入会済み (customer_plans 持ち
 *    or 任意の予約で is_member_join=true) の割合
 *
 * 入会判定は「予約自身の is_member_join フラグ」ではなく顧客レベル。
 * 5/30 新規来店 → 6/10 サブスク購入のケースで 5 月に入会としてバック
 * アタッチされる (マーケティング概要 / 新患管理 / 売上 と統一)。
 *  - 退会率: simplified as
 *      count(customers.leaved_at IN range) / count(shop customers)
 *    This is intentionally loose for round 1 — documented in the spec.
 *  - 口コミ: stub (0) until Google / HotPepper integrations land.
 *
 * Rankings (all top 10, scoped to same filters):
 *  - 生産性 = sum(sales) per staff
 *  - 入会率 = count(is_member_join) / count(appointments), min N=3
 *  - 退会率が低い = stub (empty) until per-staff churn wiring exists
 */

export interface KpiTotals {
  totalSales: number;
  newSales: number;
  continuingSales: number;
  totalAcquired: number;
  joinCount: number;
  joinRate: number;
  churnCount: number;
  churnRate: number;
  googleReviews: number;
  hotpepperReviews: number;
  // supporting context
  reservationCount: number;
  completedCount: number;
  cancelCount: number;
}

export interface StaffProductivityRow {
  staffId: number;
  staffName: string;
  sales: number;
  count: number;
}

export interface StaffJoinRateRow {
  staffId: number;
  staffName: string;
  joinRate: number;
  joinCount: number;
  total: number;
}

export interface StaffChurnRow {
  staffId: number;
  staffName: string;
  churnRate: number;
}

export interface KpiData {
  totals: KpiTotals;
  rankings: {
    productivity: StaffProductivityRow[];
    joinRate: StaffJoinRateRow[];
    churnLow: StaffChurnRow[];
  };
  meta: {
    startDate: string;
    endDate: string;
    shopId: number;
    staffId: number | null;
  };
}

function emptyKpi(
  shopId: number,
  startDate: string,
  endDate: string,
  staffId: number | null
): KpiData {
  return {
    totals: {
      totalSales: 0,
      newSales: 0,
      continuingSales: 0,
      totalAcquired: 0,
      joinCount: 0,
      joinRate: 0,
      churnCount: 0,
      churnRate: 0,
      googleReviews: 0,
      hotpepperReviews: 0,
      reservationCount: 0,
      completedCount: 0,
      cancelCount: 0,
    },
    rankings: { productivity: [], joinRate: [], churnLow: [] },
    meta: { startDate, endDate, shopId, staffId },
  };
}

export async function getKpiData(params: {
  shopId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (inclusive)
  staffId?: number | null;
}): Promise<KpiData> {
  const { shopId, startDate, endDate, staffId = null } = params;
  const supabase = await createClient();

  // Day-exclusive upper bound for start_at range queries
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  // 1. Appointments in range with staff name join
  let apptQuery = supabase
    .from("appointments")
    .select(
      "id, staff_id, customer_id, status, sales, visit_count, is_member_join, start_at, staffs(name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);
  if (staffId) apptQuery = apptQuery.eq("staff_id", staffId);

  // 2. Customer population for churn (shop-wide, not date-filtered so we
  //    have a denominator). Also pulls the 口コミ receipt columns so the
  //    KPI hero can show "何人が Google / HotPepper レビューをくれたか".
  //    Migration 00009 added these columns — fall back gracefully if the
  //    deployment hasn't applied it yet.
  const custPopQuery = supabase
    .from("customers")
    .select(
      "id, leaved_at, google_review_received_at, hotpepper_review_received_at"
    )
    .eq("shop_id", shopId)
    .is("deleted_at", null);

  const [apptRes, custResRaw] = await Promise.all([apptQuery, custPopQuery]);
  // If the review columns don't exist yet, retry without them so we
  // still get a usable KPI page. The fallback's row shape is a subset
  // of the original so we widen via `as unknown as typeof custResRaw`.
  let custRes = custResRaw;
  if (custRes.error) {
    const msg = String(custRes.error.message ?? "");
    if (
      msg.includes("google_review_received_at") ||
      msg.includes("hotpepper_review_received_at") ||
      msg.includes("does not exist")
    ) {
      const fallback = await supabase
        .from("customers")
        .select("id, leaved_at")
        .eq("shop_id", shopId)
        .is("deleted_at", null);
      custRes = fallback as unknown as typeof custResRaw;
    }
  }
  if (apptRes.error) {
    return emptyKpi(shopId, startDate, endDate, staffId);
  }
  const appointments = (apptRes.data ?? []) as Array<{
    id: number;
    staff_id: number;
    customer_id: number;
    status: number;
    sales: number | null;
    visit_count: number | null;
    is_member_join: boolean | null;
    start_at: string;
    staffs: { name: string } | null | Array<{ name: string }>;
  }>;

  // ライフタイム attribution ルックアップ:
  //   - firstCompletedApptIdByCustomer: 顧客の人生最古の status=2 予約 id
  //     (= 真の新規 1 件として集計対象になる appointment)
  //   - customerEverJoined: いつかの時点で入会/購入した顧客 id Set
  //     (= customer_plans 持ち or is_member_join=true 予約持ち)
  //   - firstPlanIdByCustomer / plansByApptId: 新規/継続 売上の分類用
  //     (予約に最古プランを含む or プラン購入なし → 新規売上、
  //      2 回目以降プランのみ → 継続売上)
  const customerIdsInRange = Array.from(
    new Set(
      appointments
        .map((a) => a.customer_id as number | null)
        .filter((id): id is number => id != null)
    )
  );
  const firstCompletedApptIdByCustomer = new Map<number, number>();
  const customerEverJoined = new Set<number>();
  const plansByApptId = new Map<number, number[]>();
  const firstPlanIdByCustomer = new Map<number, number>();
  if (customerIdsInRange.length > 0) {
    const [completedHistRes, planRowsRes, joinFlagApptsRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, customer_id, start_at")
        .eq("shop_id", shopId)
        .eq("status", 2)
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
      supabase
        .from("customer_plans")
        .select("id, customer_id, purchased_appointment_id, purchased_at")
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null)
        .order("purchased_at", { ascending: true }),
      supabase
        .from("appointments")
        .select("customer_id")
        .eq("shop_id", shopId)
        .eq("is_member_join", true)
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null),
    ]);
    for (const r of (completedHistRes.data ?? []) as Array<{
      id: number;
      customer_id: number;
      start_at: string;
    }>) {
      if (!firstCompletedApptIdByCustomer.has(r.customer_id)) {
        firstCompletedApptIdByCustomer.set(r.customer_id, r.id);
      }
    }
    type PlanRow = {
      id: number;
      customer_id: number;
      purchased_appointment_id: number | null;
      purchased_at: string;
    };
    for (const p of (planRowsRes.data ?? []) as PlanRow[]) {
      if (!firstPlanIdByCustomer.has(p.customer_id)) {
        firstPlanIdByCustomer.set(p.customer_id, p.id);
      }
      if (p.purchased_appointment_id != null) {
        const arr = plansByApptId.get(p.purchased_appointment_id) ?? [];
        arr.push(p.id);
        plansByApptId.set(p.purchased_appointment_id, arr);
      }
      customerEverJoined.add(p.customer_id);
    }
    for (const r of (joinFlagApptsRes.data ?? []) as Array<{
      customer_id: number;
    }>) {
      customerEverJoined.add(r.customer_id);
    }
  }
  const customers = (custRes.data ?? []) as Array<{
    id: number;
    leaved_at: string | null;
    google_review_received_at?: string | null;
    hotpepper_review_received_at?: string | null;
  }>;

  // --- Totals ------------------------------------------------------------
  const totals: KpiTotals = {
    totalSales: 0,
    newSales: 0,
    continuingSales: 0,
    totalAcquired: 0,
    joinCount: 0,
    joinRate: 0,
    churnCount: 0,
    churnRate: 0,
    googleReviews: 0,
    hotpepperReviews: 0,
    reservationCount: 0,
    completedCount: 0,
    cancelCount: 0,
  };

  const newCustomerSet = new Set<number>();

  // Per-staff bucketing for rankings.
  //   total       = 期間内の全予約 (join rate ranking 分母)
  //   newCount    = この担当者が施した「真の新規 (= 最古完了)」予約の件数
  //   joinCount   = 担当者の新規顧客のうちライフタイムで入会済みの件数
  const staffBuckets = new Map<
    number,
    {
      staffId: number;
      staffName: string;
      sales: number;
      count: number;
      newCount: number;
      joinCount: number;
      total: number;
    }
  >();

  for (const a of appointments) {
    totals.reservationCount += 1;
    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isComplete = a.status === 2;

    if (isCancel) totals.cancelCount += 1;
    if (isComplete) totals.completedCount += 1;

    // 「真の新規来店」 = この予約 id が顧客の人生最古の status=2 予約 id
    // と一致 (= status=2 確定)。
    const isTrueNew =
      a.customer_id != null &&
      firstCompletedApptIdByCustomer.get(a.customer_id) === a.id;

    // 「継続売上」 = この予約に紐づくプランがあり、最古プランを含まない
    // (= 2 回目以降のプラン購入のみ)。最古プランを含む / プラン購入なし
    // は新規売上とする。
    const planIds = plansByApptId.get(a.id) ?? [];
    const firstPlanId =
      a.customer_id != null
        ? firstPlanIdByCustomer.get(a.customer_id) ?? null
        : null;
    const containsFirstPlan =
      firstPlanId != null && planIds.some((id) => id === firstPlanId);
    const isContinuingSale = planIds.length > 0 && !containsFirstPlan;

    if (isComplete && a.sales) {
      totals.totalSales += a.sales;
      if (isContinuingSale) totals.continuingSales += a.sales;
      else totals.newSales += a.sales;
    }

    // 総新規数 = 期間内に最古完了予約 (= 真の新規) が立った顧客の
    // ユニーク数。入会数はライフタイム判定で「その新規顧客が入会済み
    // であれば 1 加算」する。
    if (isTrueNew && a.customer_id != null) {
      newCustomerSet.add(a.customer_id);
      if (customerEverJoined.has(a.customer_id)) {
        totals.joinCount += 1;
      }
    }

    // Staff bucket — join name. Supabase returns joined row as either
    // object or one-element array depending on codegen.
    const staffName = Array.isArray(a.staffs)
      ? a.staffs[0]?.name ?? "不明"
      : a.staffs?.name ?? "不明";
    let bucket = staffBuckets.get(a.staff_id);
    if (!bucket) {
      bucket = {
        staffId: a.staff_id,
        staffName,
        sales: 0,
        count: 0,
        newCount: 0,
        joinCount: 0,
        total: 0,
      };
      staffBuckets.set(a.staff_id, bucket);
    }
    bucket.total += 1;
    if (isComplete && a.sales) {
      bucket.sales += a.sales;
      bucket.count += 1;
    }
    if (isTrueNew && a.customer_id != null) {
      bucket.newCount += 1;
      if (customerEverJoined.has(a.customer_id)) {
        bucket.joinCount += 1;
      }
    }
  }

  totals.totalAcquired = newCustomerSet.size;
  // 入会率 = 新規顧客のうちライフタイム入会済みの割合
  totals.joinRate =
    totals.totalAcquired > 0 ? totals.joinCount / totals.totalAcquired : 0;

  // --- 口コミ (shop-wide cumulative, NOT date-filtered) ------------------
  // Staff toggle these flags once per customer; the KPI card shows the
  // running total of customers-who-have-reviewed, similar to a lifetime
  // counter. Date filtering was deliberate — asking a customer for a
  // review at a past visit would otherwise zero out the hero card for
  // the current month even though the review still counts.
  for (const c of customers) {
    if (c.google_review_received_at) totals.googleReviews += 1;
    if (c.hotpepper_review_received_at) totals.hotpepperReviews += 1;
  }

  // --- Churn (simplified) ------------------------------------------------
  // Count customers whose leaved_at falls in [startDate, endDate].
  const startTs = `${startDate}T00:00:00+09:00`;
  const endTs = `${endDate}T23:59:59+09:00`;
  const churnedInRange = customers.filter((c) => {
    if (!c.leaved_at) return false;
    return c.leaved_at >= startTs && c.leaved_at <= endTs;
  });
  totals.churnCount = churnedInRange.length;
  totals.churnRate =
    customers.length > 0 ? totals.churnCount / customers.length : 0;

  // --- Rankings ----------------------------------------------------------
  const buckets = Array.from(staffBuckets.values());

  const productivity = [...buckets]
    .filter((b) => b.sales > 0)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10)
    .map((b) => ({
      staffId: b.staffId,
      staffName: b.staffName,
      sales: b.sales,
      count: b.count,
    }));

  // 入会率 ranking: 担当者の新規顧客 (= newCount) が分母、ライフタイム
  // 入会済み新規 (= joinCount) が分子。新規が MIN_SAMPLE 未満の担当は
  // ノイズになるので除外。
  const MIN_SAMPLE = 3;
  const joinRateRows = [...buckets]
    .filter((b) => b.newCount >= MIN_SAMPLE)
    .map((b) => ({
      staffId: b.staffId,
      staffName: b.staffName,
      joinCount: b.joinCount,
      total: b.newCount,
      joinRate: b.newCount > 0 ? b.joinCount / b.newCount : 0,
    }))
    .sort((a, b) => b.joinRate - a.joinRate)
    .slice(0, 10);

  // churnLow per-staff is a stub for this round — we don't track churn
  // attribution at the staff level yet. Returning [] is a hint to the UI
  // to show a placeholder message.
  const churnLow: StaffChurnRow[] = [];

  return {
    totals,
    rankings: {
      productivity,
      joinRate: joinRateRows,
      churnLow,
    },
    meta: { startDate, endDate, shopId, staffId },
  };
}
