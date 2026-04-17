"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Marketing dashboard aggregation.
 *
 * One call per page load. Pulls raw appointments + raw ad_spend for the
 * requested period, then bucketizes in-memory by month and by visit
 * source. See CLAUDE.md "マーケティング分析" for the exact KPI formulas.
 */

export interface MarketingTotals {
  visitCount: number;        // 実来院数 (completed or in-progress)
  reservationCount: number;  // 予約総数 (any status)
  joinCount: number;         // 入会数
  cancelCount: number;       // キャンセル系の数
  adSpend: number;           // 広告費合計
  sales: number;             // 売上 (status = 2 のみ)
  reviewCount: number;       // 口コミ数 (未実装: 0)
  joinRate: number;          // 入会数 / 実来院数
  cancelRate: number;        // キャンセル / 予約総数
  cpa: number;               // 広告費 / 実来院数
  roas: number;              // 売上 / 広告費
  avgPrice: number;          // 売上 / 実来院数
}

export interface MarketingMonthBucket extends MarketingTotals {
  yearMonth: string; // 'YYYY-MM'
}

export interface MarketingSourceBucket extends MarketingTotals {
  visitSourceId: number;
  sourceName: string | null;
}

export interface MarketingData {
  totals: MarketingTotals;
  byMonth: MarketingMonthBucket[];
  bySource: MarketingSourceBucket[];
  meta: {
    startMonth: string;
    endMonth: string;
    shopId: number;
    shopName: string | null;
  };
}

function emptyTotals(): MarketingTotals {
  return {
    visitCount: 0,
    reservationCount: 0,
    joinCount: 0,
    cancelCount: 0,
    adSpend: 0,
    sales: 0,
    reviewCount: 0,
    joinRate: 0,
    cancelRate: 0,
    cpa: 0,
    roas: 0,
    avgPrice: 0,
  };
}

function finalize(t: MarketingTotals): MarketingTotals {
  return {
    ...t,
    joinRate: t.visitCount > 0 ? t.joinCount / t.visitCount : 0,
    cancelRate:
      t.reservationCount > 0 ? t.cancelCount / t.reservationCount : 0,
    cpa: t.visitCount > 0 ? t.adSpend / t.visitCount : 0,
    roas: t.adSpend > 0 ? t.sales / t.adSpend : 0,
    avgPrice: t.visitCount > 0 ? t.sales / t.visitCount : 0,
  };
}

/**
 * Returns the list of 'YYYY-MM' strings inclusive between startMonth and
 * endMonth. Returns [] for invalid input.
 */
function monthRange(startMonth: string, endMonth: string): string[] {
  const re = /^(\d{4})-(\d{2})$/;
  const a = re.exec(startMonth);
  const b = re.exec(endMonth);
  if (!a || !b) return [];
  let y = Number(a[1]);
  let m = Number(a[2]);
  const ey = Number(b[1]);
  const em = Number(b[2]);
  const out: string[] = [];
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 240) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

function appointmentYearMonth(startAt: string): string {
  // start_at is ISO with Z — treat as Asia/Tokyo for bucketing.
  // Cheap: add 9h and slice. (The calendar query already scopes the
  // window to Asia/Tokyo-aligned days, so this is close enough for
  // per-month bucketing. Exact boundary cases are rare.)
  const d = new Date(startAt);
  d.setUTCHours(d.getUTCHours() + 9);
  return d.toISOString().slice(0, 7);
}

export async function getMarketingData(params: {
  brandId: number;
  shopId: number;
  startMonth: string; // 'YYYY-MM'
  endMonth: string;   // 'YYYY-MM' (inclusive)
  visitSourceId?: number | null;
  staffId?: number | null;
}): Promise<MarketingData> {
  const {
    brandId: _brandId,
    shopId,
    startMonth,
    endMonth,
    visitSourceId,
    staffId,
  } = params;
  const supabase = await createClient();

  // Start of startMonth and end of endMonth (exclusive = start of next month)
  const startTs = `${startMonth}-01T00:00:00+09:00`;
  const [ey, em] = endMonth.split("-").map(Number);
  const nextY = em === 12 ? ey + 1 : ey;
  const nextM = em === 12 ? 1 : em + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  // 1. Appointments in range for this shop.
  //
  // Marketing analytics = 新規のみ.
  // Per product spec ("マーケティング分析の実来院などは全て初回の新規の
  // みだけの数をカウントする。キャンセルなども。") every metric on the
  // marketing dashboard — 実来院 / キャンセル / 入会 / 売上 / 予約数 —
  // must only count the customer's FIRST-EVER appointment. Return
  // visits don't belong here.
  //
  // We filter on `visit_count = 1`. That column is stamped by
  // reservationActions.createAppointment as the customer's cumulative
  // visit number at the time of booking, so visit_count=1 means "this
  // is the booking that made them a customer".
  // is_continued_billing=true (サブスク月次課金の "幽霊予約") は
  // 来院扱いせず、売上にも新規カウントにも含めない (別途の自動継続分で
  // 売上は計上される想定)。deleted_at と同様に集計から除外する。
  let apptQuery = supabase
    .from("appointments")
    .select(
      "id, status, start_at, sales, visit_source_id, is_member_join, cancelled_at, visit_count"
    )
    .eq("shop_id", shopId)
    .eq("visit_count", 1)
    .eq("is_continued_billing", false)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  if (visitSourceId) {
    apptQuery = apptQuery.eq("visit_source_id", visitSourceId);
  }
  if (staffId) {
    apptQuery = apptQuery.eq("staff_id", staffId);
  }

  const [apptRes, sourcesRes, shopRes, adSpendRes] = await Promise.all([
    apptQuery,
    supabase
      .from("visit_sources")
      .select("id, name")
      .eq("shop_id", shopId)
      .is("deleted_at", null),
    supabase.from("shops").select("id, name").eq("id", shopId).maybeSingle(),
    supabase
      .from("ad_spend")
      .select("visit_source_id, year_month, amount")
      .eq("shop_id", shopId)
      .gte("year_month", startMonth)
      .lte("year_month", endMonth)
      .is("deleted_at", null),
  ]);

  const appointments = apptRes.data ?? [];
  const sources = sourcesRes.data ?? [];
  const adSpendRows = adSpendRes.data ?? [];

  const sourceNameMap = new Map<number, string>(
    sources.map((s) => [s.id as number, s.name as string])
  );

  // Prepare month buckets for every month in range so the table renders
  // zero-rows instead of gaps.
  const months = monthRange(startMonth, endMonth);
  const monthBuckets = new Map<string, MarketingTotals>();
  for (const m of months) monthBuckets.set(m, emptyTotals());

  const sourceBuckets = new Map<number, MarketingTotals>();

  const totals = emptyTotals();

  for (const a of appointments as Array<{
    status: number;
    start_at: string;
    sales: number | null;
    visit_source_id: number | null;
    is_member_join: boolean | null;
    visit_count: number | null;
  }>) {
    // Defensive: even though the SELECT already filters visit_count=1,
    // legacy rows may have NULL visit_count (pre-migration 00006).
    // Exclude them so the dashboard matches spec strictly.
    if ((a.visit_count ?? 0) !== 1) continue;
    const ym = appointmentYearMonth(a.start_at);
    const mb = monthBuckets.get(ym) ?? (() => {
      const b = emptyTotals();
      monthBuckets.set(ym, b);
      return b;
    })();

    const sid = a.visit_source_id ?? 0;
    let sb = sourceBuckets.get(sid);
    if (!sb) {
      sb = emptyTotals();
      sourceBuckets.set(sid, sb);
    }

    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isVisit = a.status === 1 || a.status === 2;
    const isComplete = a.status === 2;

    totals.reservationCount += 1;
    mb.reservationCount += 1;
    sb.reservationCount += 1;

    if (isCancel) {
      totals.cancelCount += 1;
      mb.cancelCount += 1;
      sb.cancelCount += 1;
    }
    if (isVisit) {
      totals.visitCount += 1;
      mb.visitCount += 1;
      sb.visitCount += 1;
    }
    if (isComplete && a.sales) {
      totals.sales += a.sales;
      mb.sales += a.sales;
      sb.sales += a.sales;
    }
    if (a.is_member_join) {
      totals.joinCount += 1;
      mb.joinCount += 1;
      sb.joinCount += 1;
    }
  }

  // 2. Distribute ad_spend into monthly + source buckets
  for (const r of adSpendRows as Array<{
    visit_source_id: number;
    year_month: string;
    amount: number;
  }>) {
    if (visitSourceId && r.visit_source_id !== visitSourceId) continue;
    totals.adSpend += r.amount;
    const mb = monthBuckets.get(r.year_month);
    if (mb) mb.adSpend += r.amount;
    let sb = sourceBuckets.get(r.visit_source_id);
    if (!sb) {
      sb = emptyTotals();
      sourceBuckets.set(r.visit_source_id, sb);
    }
    sb.adSpend += r.amount;
  }

  // 3. Finalize rates/derived numbers
  const finalTotals = finalize(totals);
  const byMonth: MarketingMonthBucket[] = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, t]) => ({ yearMonth, ...finalize(t) }));
  const bySource: MarketingSourceBucket[] = Array.from(sourceBuckets.entries())
    .map(([visitSourceId, t]) => ({
      visitSourceId,
      sourceName: sourceNameMap.get(visitSourceId) ?? null,
      ...finalize(t),
    }))
    .sort((a, b) => b.sales - a.sales);

  return {
    totals: finalTotals,
    byMonth,
    bySource,
    meta: {
      startMonth,
      endMonth,
      shopId,
      shopName: (shopRes.data?.name as string | null) ?? null,
    },
  };
}
