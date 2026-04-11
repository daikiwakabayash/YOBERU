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
      "id, staff_id, customer_id, status, sales, visit_count, is_member_join, staffs(name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);
  if (staffId) apptQuery = apptQuery.eq("staff_id", staffId);

  // 2. Customer population for churn (shop-wide, not date-filtered so we
  //    have a denominator). Light query (id + leaved_at only).
  const custPopQuery = supabase
    .from("customers")
    .select("id, leaved_at")
    .eq("shop_id", shopId)
    .is("deleted_at", null);

  const [apptRes, custRes] = await Promise.all([apptQuery, custPopQuery]);
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
    staffs: { name: string } | null | Array<{ name: string }>;
  }>;
  const customers = (custRes.data ?? []) as Array<{
    id: number;
    leaved_at: string | null;
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

    if (isComplete && a.sales) {
      totals.totalSales += a.sales;
      if (visit === 1) totals.newSales += a.sales;
      else if (visit > 1) totals.continuingSales += a.sales;
    }

    if (visit === 1 && isVisit) {
      newCustomerSet.add(a.customer_id);
      newVisitDenominator += 1;
    }
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
