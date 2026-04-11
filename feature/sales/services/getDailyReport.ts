"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

/**
 * Daily sales report aggregation.
 *
 * One row per day. Each row contains:
 *   - visit / cancel counts
 *   - new vs continuing sales (店舗の売上)
 *   - per-payment-method totals
 *   - per-source new-customer counts
 *
 * 新規 vs 継続 rule (per spec):
 *   新規 = (a) the customer's first visit (visit_count === 1) OR
 *         (b) the customer's first ever appointment with
 *             is_member_join = true (i.e. first time joining a plan)
 *   継続 = everything else
 *
 * Implementation: pulls completed appointments in the date range, plus
 * the customers' member-join history (any time) so we can flag the
 * earliest join per customer. Aggregation is in-memory.
 */

export interface PaymentTotal {
  code: string;        // raw payment_method string ("cash", "square", ...)
  label: string;       // resolved name (e.g. "現金", "Square")
  amount: number;
}

export interface SourceCount {
  visitSourceId: number;
  sourceName: string;
  newCount: number;
}

export interface DailyRow {
  date: string;            // YYYY-MM-DD (Asia/Tokyo)
  reservationCount: number;
  visitCount: number;      // status 1 or 2
  cancelCount: number;     // status 3, 4, 99
  newCount: number;        // appointments classified as 新規 (sales counted)
  continuingCount: number; // appointments classified as 継続
  newSales: number;
  continuingSales: number;
  totalSales: number;
  payments: PaymentTotal[];
  newBySource: SourceCount[];
}

export interface DailyReportData {
  rows: DailyRow[];
  totals: {
    reservationCount: number;
    visitCount: number;
    cancelCount: number;
    newCount: number;
    continuingCount: number;
    newSales: number;
    continuingSales: number;
    totalSales: number;
  };
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

function dayInTokyo(iso: string): string {
  // Convert ISO timestamp to Asia/Tokyo YYYY-MM-DD via +9h shift
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + 9);
  return d.toISOString().slice(0, 10);
}

export async function getDailyReport(
  shopId: number,
  startDate: string,
  endDate: string
): Promise<DailyReportData> {
  const supabase = await createClient();

  // Day-exclusive upper bound (start_at < end + 1)
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  // 1. All appointments in range for this shop
  const { data: apptRes, error: apptErr } = await supabase
    .from("appointments")
    .select(
      "id, customer_id, status, start_at, sales, visit_count, is_member_join, payment_method, visit_source_id, cancelled_at"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null)
    .order("start_at");
  if (apptErr) {
    return emptyReport(shopId, startDate, endDate);
  }
  const appointments = (apptRes ?? []) as Array<{
    id: number;
    customer_id: number;
    status: number;
    start_at: string;
    sales: number | null;
    visit_count: number | null;
    is_member_join: boolean | null;
    payment_method: string | null;
    visit_source_id: number | null;
  }>;

  // 2. For customers who have a member-join in this range, look up their
  //    earliest member-join globally so we can decide if THIS appointment
  //    is the customer's first plan purchase (= 新規 by rule b).
  const customerIdsWithJoinInRange = Array.from(
    new Set(
      appointments
        .filter((a) => a.is_member_join && a.status === 2)
        .map((a) => a.customer_id)
    )
  );
  const earliestJoinByCustomer = new Map<number, string>();
  if (customerIdsWithJoinInRange.length > 0) {
    const { data: joinHistory } = await supabase
      .from("appointments")
      .select("customer_id, start_at")
      .in("customer_id", customerIdsWithJoinInRange)
      .eq("is_member_join", true)
      .eq("status", 2)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    for (const r of (joinHistory ?? []) as Array<{
      customer_id: number;
      start_at: string;
    }>) {
      if (!earliestJoinByCustomer.has(r.customer_id)) {
        earliestJoinByCustomer.set(r.customer_id, r.start_at);
      }
    }
  }

  // 3. Resolve visit_source names (single lookup)
  const sourceIds = Array.from(
    new Set(
      appointments
        .map((a) => a.visit_source_id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  const sourceNameMap = new Map<number, string>();
  if (sourceIds.length > 0) {
    const { data: sources } = await supabase
      .from("visit_sources")
      .select("id, name")
      .in("id", sourceIds);
    for (const s of sources ?? []) {
      sourceNameMap.set(s.id as number, s.name as string);
    }
  }

  // 4. Bucket by Tokyo day
  const byDay = new Map<string, DailyRow>();
  // Internal accumulators that aren't part of the final shape
  const paymentBuckets = new Map<string, Map<string, number>>(); // day → code → amount
  const sourceBuckets = new Map<string, Map<number, number>>();  // day → sourceId → newCount

  function getDay(dateStr: string): DailyRow {
    let row = byDay.get(dateStr);
    if (!row) {
      row = {
        date: dateStr,
        reservationCount: 0,
        visitCount: 0,
        cancelCount: 0,
        newCount: 0,
        continuingCount: 0,
        newSales: 0,
        continuingSales: 0,
        totalSales: 0,
        payments: [],
        newBySource: [],
      };
      byDay.set(dateStr, row);
      paymentBuckets.set(dateStr, new Map());
      sourceBuckets.set(dateStr, new Map());
    }
    return row;
  }

  for (const a of appointments) {
    const day = dayInTokyo(a.start_at);
    const row = getDay(day);
    row.reservationCount += 1;

    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isVisit = a.status === 1 || a.status === 2;
    const isComplete = a.status === 2;

    if (isCancel) row.cancelCount += 1;
    if (isVisit) row.visitCount += 1;

    if (isComplete && a.sales) {
      // 新規 vs 継続 classification
      let isNew = false;
      if ((a.visit_count ?? 0) === 1) {
        isNew = true;
      } else if (a.is_member_join) {
        const earliest = earliestJoinByCustomer.get(a.customer_id);
        if (earliest && earliest === a.start_at) {
          isNew = true;
        }
      }

      if (isNew) {
        row.newSales += a.sales;
        row.newCount += 1;
      } else {
        row.continuingSales += a.sales;
        row.continuingCount += 1;
      }
      row.totalSales += a.sales;

      // Payment method bucket
      const code = a.payment_method ?? "unknown";
      const paymap = paymentBuckets.get(day)!;
      paymap.set(code, (paymap.get(code) ?? 0) + a.sales);

      // Source bucket only counts new customers
      if (isNew && a.visit_source_id) {
        const smap = sourceBuckets.get(day)!;
        smap.set(
          a.visit_source_id,
          (smap.get(a.visit_source_id) ?? 0) + 1
        );
      }
    }
  }

  // 5. Materialize the chip arrays from internal maps
  for (const [day, row] of byDay.entries()) {
    const pays = paymentBuckets.get(day)!;
    row.payments = Array.from(pays.entries())
      .map(([code, amount]) => ({
        code,
        label: PAYMENT_LABELS[code] ?? (code === "unknown" ? "未設定" : code),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    const sources = sourceBuckets.get(day)!;
    row.newBySource = Array.from(sources.entries())
      .map(([visitSourceId, newCount]) => ({
        visitSourceId,
        sourceName: sourceNameMap.get(visitSourceId) ?? `#${visitSourceId}`,
        newCount,
      }))
      .sort((a, b) => b.newCount - a.newCount);
  }

  // 6. Sort rows newest first (matching how reports are usually read)
  const rows = Array.from(byDay.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const totals = rows.reduce(
    (g, r) => {
      g.reservationCount += r.reservationCount;
      g.visitCount += r.visitCount;
      g.cancelCount += r.cancelCount;
      g.newCount += r.newCount;
      g.continuingCount += r.continuingCount;
      g.newSales += r.newSales;
      g.continuingSales += r.continuingSales;
      g.totalSales += r.totalSales;
      return g;
    },
    {
      reservationCount: 0,
      visitCount: 0,
      cancelCount: 0,
      newCount: 0,
      continuingCount: 0,
      newSales: 0,
      continuingSales: 0,
      totalSales: 0,
    }
  );

  return {
    rows,
    totals,
    meta: { startDate, endDate, shopId },
  };
}

function emptyReport(
  shopId: number,
  startDate: string,
  endDate: string
): DailyReportData {
  return {
    rows: [],
    totals: {
      reservationCount: 0,
      visitCount: 0,
      cancelCount: 0,
      newCount: 0,
      continuingCount: 0,
      newSales: 0,
      continuingSales: 0,
      totalSales: 0,
    },
    meta: { startDate, endDate, shopId },
  };
}
