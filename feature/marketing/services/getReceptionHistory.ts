"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * 受付履歴 (デイリー集計の明細リスト).
 *
 * 「日報の数値ズレを調べたい」「スタッフが2ヶ月でどんな客を見ていたか
 * 一覧で確認したい」という用途。getDailyReport / getKpiData と同じ
 * 「初回プラン購入 = 新規売上」判定をそのまま使い、行ごとに分類して返す。
 */

export interface ReceptionRow {
  id: number;                 // appointment id
  date: string;               // YYYY-MM-DD (Asia/Tokyo)
  startAt: string;            // ISO (時刻も持つ)
  staffId: number | null;
  staffName: string;
  customerId: number | null;
  customerCode: string | null;
  customerName: string;       // last_name + first_name
  memo: string;               // appointment.memo の先頭 1 行 (空なら "")
  status: number;             // 0=待機 / 1=施術中 / 2=完了 / 3=キャンセル / 4=当キャン / 99=no-show
  /** 「初・継」 (= 売上分類). plan 購入ベース */
  classification: "new" | "continuing";
  /** 「真の新規来店」 = 顧客の人生最古の予約と一致 */
  isFirstEverVisit: boolean;
  isMemberJoin: boolean;
  sales: number;
  consumedAmount: number;
  plans: Array<{
    name: string;
    price: number;
    planType: string;     // 'ticket' | 'subscription'
    totalCount: number | null;
    isFirstPlan: boolean; // 顧客の最古プランかどうか
  }>;
  paymentSummary: string;   // "現金 ¥2,000 / Square ¥12,100" のような表示用
  visitSourceId: number | null;
  visitSourceName: string;
}

export interface ReceptionHistoryData {
  rows: ReceptionRow[];
  meta: {
    startDate: string;
    endDate: string;
    shopId: number;
  };
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "現金",
  credit: "クレジット",
  card: "カード",
  square: "Square",
  paypay: "PayPay",
  line: "LINE Pay",
  bank: "銀行振込",
  other: "その他",
};

function parseSplits(
  raw: unknown
): Array<{ method: string; amount: number }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ method: string; amount: number }> = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { method?: unknown; amount?: unknown };
    const method = typeof rec.method === "string" ? rec.method : "";
    const amount = Number(rec.amount);
    if (!method || !Number.isFinite(amount) || amount < 0) continue;
    out.push({ method, amount: Math.round(amount) });
  }
  return out.length > 0 ? out : null;
}

function formatPaymentSummary(
  paymentMethod: string | null,
  splitsRaw: unknown,
  sales: number
): string {
  if (sales <= 0) return "";
  const splits = parseSplits(splitsRaw);
  if (splits && splits.length > 0) {
    return splits
      .map((s) => `${PAYMENT_LABELS[s.method] ?? s.method} ¥${s.amount.toLocaleString()}`)
      .join(" / ");
  }
  if (!paymentMethod) return `未設定 ¥${sales.toLocaleString()}`;
  return `${PAYMENT_LABELS[paymentMethod] ?? paymentMethod} ¥${sales.toLocaleString()}`;
}

export async function getReceptionHistory(params: {
  shopId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (inclusive)
  staffId?: number | null;
  onlyNew?: boolean;       // 真の新規来店のみ
  onlyMemberJoin?: boolean;// 入会のみ
}): Promise<ReceptionHistoryData> {
  const { shopId, startDate, endDate, staffId, onlyNew, onlyMemberJoin } = params;
  const supabase = await createClient();

  // Day-exclusive upper bound
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  let apptQuery = supabase
    .from("appointments")
    .select(
      "id, customer_id, staff_id, status, start_at, sales, consumed_amount, memo, is_member_join, payment_method, payment_splits, visit_source_id, type"
    )
    .eq("shop_id", shopId)
    // 通常予約のみ。type=1 (ミーティング) / type=2 (その他) はスロット
    // ブロック (SYS-BLOCK-<shopId> 顧客に紐付く) なので集計から除外。
    .eq("type", 0)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null)
    .order("start_at", { ascending: true });
  if (staffId) apptQuery = apptQuery.eq("staff_id", staffId);

  const apptRes = await apptQuery;
  if (apptRes.error) {
    return { rows: [], meta: { startDate, endDate, shopId } };
  }
  type ApptRow = {
    id: number;
    customer_id: number | null;
    staff_id: number | null;
    status: number;
    start_at: string;
    sales: number | null;
    consumed_amount: number | null;
    memo: string | null;
    is_member_join: boolean | null;
    payment_method: string | null;
    payment_splits?: unknown;
    visit_source_id: number | null;
    type: number;
  };
  const appointments = (apptRes.data ?? []) as ApptRow[];

  // Lookup tables (lazy if no rows)
  const customerIds = Array.from(
    new Set(appointments.map((a) => a.customer_id).filter((id): id is number => id != null))
  );
  const staffIds = Array.from(
    new Set(appointments.map((a) => a.staff_id).filter((id): id is number => id != null))
  );
  const sourceIds = Array.from(
    new Set(
      appointments.map((a) => a.visit_source_id).filter((id): id is number => id != null)
    )
  );

  const [
    customersRes,
    staffsRes,
    sourcesRes,
    firstEverApptRes,
    plansRes,
  ] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, code, last_name, first_name")
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null } as const),
    staffIds.length
      ? supabase.from("staffs").select("id, name").in("id", staffIds)
      : Promise.resolve({ data: [], error: null } as const),
    sourceIds.length
      ? supabase
          .from("visit_sources")
          .select("id, name")
          .in("id", sourceIds)
      : Promise.resolve({ data: [], error: null } as const),
    customerIds.length
      ? supabase
          .from("appointments")
          .select("id, customer_id, start_at")
          .eq("shop_id", shopId)
          .in("customer_id", customerIds)
          .is("deleted_at", null)
          .order("start_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    customerIds.length
      ? supabase
          .from("customer_plans")
          .select(
            "id, customer_id, purchased_appointment_id, purchased_at, menu_name_snapshot, price_snapshot, plan_type, total_count"
          )
          .in("customer_id", customerIds)
          .is("deleted_at", null)
          .order("purchased_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const customerById = new Map<
    number,
    { code: string | null; last_name: string | null; first_name: string | null }
  >();
  for (const c of (customersRes.data ?? []) as Array<{
    id: number;
    code: string | null;
    last_name: string | null;
    first_name: string | null;
  }>) {
    customerById.set(c.id, {
      code: c.code,
      last_name: c.last_name,
      first_name: c.first_name,
    });
  }

  const staffNameById = new Map<number, string>();
  for (const s of (staffsRes.data ?? []) as Array<{ id: number; name: string }>) {
    staffNameById.set(s.id, s.name);
  }

  const sourceNameById = new Map<number, string>();
  for (const s of (sourcesRes.data ?? []) as Array<{ id: number; name: string }>) {
    sourceNameById.set(s.id, s.name);
  }

  // 「真の新規来店」 = 顧客の人生最古の予約 id
  const firstEverApptIdByCustomer = new Map<number, number>();
  for (const r of (firstEverApptRes.data ?? []) as Array<{
    id: number;
    customer_id: number;
    start_at: string;
  }>) {
    if (!firstEverApptIdByCustomer.has(r.customer_id)) {
      firstEverApptIdByCustomer.set(r.customer_id, r.id);
    }
  }

  // 「初回プラン購入予約」用
  type PlanRow = {
    id: number;
    customer_id: number;
    purchased_appointment_id: number | null;
    purchased_at: string;
    menu_name_snapshot: string | null;
    price_snapshot: number | null;
    plan_type: string;
    total_count: number | null;
  };
  const firstPlanIdByCustomer = new Map<number, number>();
  const plansByApptId = new Map<number, PlanRow[]>();
  for (const p of (plansRes.data ?? []) as PlanRow[]) {
    if (!firstPlanIdByCustomer.has(p.customer_id)) {
      firstPlanIdByCustomer.set(p.customer_id, p.id);
    }
    if (p.purchased_appointment_id != null) {
      const arr = plansByApptId.get(p.purchased_appointment_id) ?? [];
      arr.push(p);
      plansByApptId.set(p.purchased_appointment_id, arr);
    }
  }

  // Build rows
  const rows: ReceptionRow[] = [];
  for (const a of appointments) {
    // slot block 等は除外 (= customer_id が無い予約)
    if (a.customer_id == null) continue;

    const customer = customerById.get(a.customer_id);
    const customerName = customer
      ? `${customer.last_name ?? ""} ${customer.first_name ?? ""}`.trim()
      : "(不明)";

    const isFirstEverVisit =
      firstEverApptIdByCustomer.get(a.customer_id) === a.id;

    const apptPlans = plansByApptId.get(a.id) ?? [];
    const firstPlanId = firstPlanIdByCustomer.get(a.customer_id) ?? null;
    const containsFirstPlan =
      firstPlanId != null && apptPlans.some((p) => p.id === firstPlanId);
    const classification: "new" | "continuing" =
      apptPlans.length > 0 && !containsFirstPlan ? "continuing" : "new";

    const memo = (a.memo ?? "").split("\n")[0]?.trim() ?? "";

    rows.push({
      id: a.id,
      date: a.start_at.slice(0, 10),
      startAt: a.start_at,
      staffId: a.staff_id,
      staffName: a.staff_id ? staffNameById.get(a.staff_id) ?? "(不明)" : "",
      customerId: a.customer_id,
      customerCode: customer?.code ?? null,
      customerName,
      memo,
      status: a.status,
      classification,
      isFirstEverVisit,
      isMemberJoin: !!a.is_member_join,
      sales: a.sales ?? 0,
      consumedAmount: a.consumed_amount ?? 0,
      plans: apptPlans.map((p) => ({
        name: p.menu_name_snapshot ?? "(不明プラン)",
        price: p.price_snapshot ?? 0,
        planType: p.plan_type,
        totalCount: p.total_count,
        isFirstPlan: firstPlanId === p.id,
      })),
      paymentSummary: formatPaymentSummary(
        a.payment_method,
        a.payment_splits,
        a.sales ?? 0
      ),
      visitSourceId: a.visit_source_id,
      visitSourceName: a.visit_source_id
        ? sourceNameById.get(a.visit_source_id) ?? ""
        : "",
    });
  }

  // Apply onlyNew / onlyMemberJoin (post filtering since they depend on
  // computed flags above)
  const filtered = rows.filter((r) => {
    if (onlyNew && !r.isFirstEverVisit) return false;
    if (onlyMemberJoin && !r.isMemberJoin) return false;
    return true;
  });

  return {
    rows: filtered,
    meta: { startDate, endDate, shopId },
  };
}
