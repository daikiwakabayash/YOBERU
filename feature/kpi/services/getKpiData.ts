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
 *    appointments.visit_count === 1 vs > 1
 *  - 総新規数: count(distinct customer) with visit_count === 1 in range
 *  - 入会率: is_member_join / visit-count-1 appointments (status 1 or 2)
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

  // 「真の新規」判定 (= 顧客の人生最初の予約 id)
  // 売上タブ (getDailyReport) / マーケティング と同じロジック。
  // stamped visit_count に依存しないので、キャンセル後再予約や
  // レガシーデータでも安定して判定できる。
  const customerIdsInRange = Array.from(
    new Set(
      appointments
        .map((a) => a.customer_id as number | null)
        .filter((id): id is number => id != null)
    )
  );
  const firstEverApptIdByCustomer = new Map<number, number>();
  if (customerIdsInRange.length > 0) {
    const { data: histRows } = await supabase
      .from("appointments")
      .select("id, customer_id, start_at")
      .eq("shop_id", shopId)
      .in("customer_id", customerIdsInRange)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    for (const r of (histRows ?? []) as Array<{
      id: number;
      customer_id: number;
      start_at: string;
    }>) {
      if (!firstEverApptIdByCustomer.has(r.customer_id)) {
        firstEverApptIdByCustomer.set(r.customer_id, r.id);
      }
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
  let newVisitDenominator = 0; // visit_count === 1 appointments in status 1 or 2

  // Per-staff bucketing for rankings
  const staffBuckets = new Map<
    number,
    {
      staffId: number;
      staffName: string;
      sales: number;
      count: number;
      joinCount: number;
      total: number; // all appointments (for join rate denominator)
    }
  >();

  for (const a of appointments) {
    totals.reservationCount += 1;
    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isComplete = a.status === 2;
    const isVisit = a.status === 1 || a.status === 2;
    const visit = a.visit_count ?? 0;

    if (isCancel) totals.cancelCount += 1;
    if (isComplete) totals.completedCount += 1;

    // 「真の新規」 = この予約 id が顧客の人生最初の予約 id と一致
    const isTrueNew =
      a.customer_id != null &&
      firstEverApptIdByCustomer.get(a.customer_id) === a.id;

    if (isComplete && a.sales) {
      totals.totalSales += a.sales;
      if (isTrueNew) totals.newSales += a.sales;
      else totals.continuingSales += a.sales;
    }

    // 総新規数 = 期間内に「人生初の予約 (= status は問わない)」が立った
    // 顧客のユニーク数。来店分母は完了 + 施術中。
    if (isTrueNew && isVisit) {
      newCustomerSet.add(a.customer_id);
      newVisitDenominator += 1;
    }
    void visit;
    if (a.is_member_join) totals.joinCount += 1;

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
    if (a.is_member_join) bucket.joinCount += 1;
  }

  totals.totalAcquired = newCustomerSet.size;
  totals.joinRate =
    newVisitDenominator > 0 ? totals.joinCount / newVisitDenominator : 0;

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

  const MIN_SAMPLE = 3;
  const joinRateRows = [...buckets]
    .filter((b) => b.total >= MIN_SAMPLE)
    .map((b) => ({
      staffId: b.staffId,
      staffName: b.staffName,
      joinCount: b.joinCount,
      total: b.total,
      joinRate: b.total > 0 ? b.joinCount / b.total : 0,
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
