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
  cancelCount: number;       // キャンセル系の数 (= cancelStandard + cancelSameDay + noShow)
  /** status=3 通常キャンセル (前日までの取消) の件数 */
  cancelStandard: number;
  /** status=4 当日キャンセル */
  cancelSameDay: number;
  /** status=99 無断キャンセル (no-show) */
  noShow: number;
  /** status=0 待機 (これから来店予定 / 未処理) */
  pendingCount: number;
  adSpend: number;           // 広告費合計
  sales: number;             // 売上 (status = 2 のみ)
  consumedSales: number;     // 消化売上 (前金プランの実消費、status = 2)
  googleReviewCount: number; // Google 口コミ受領数 (期間内)
  hotpepperReviewCount: number; // HotPepper 口コミ受領数 (期間内)
  reviewCount: number;       // 合計 (= G + H、後方互換)
  joinRate: number;          // 入会数 / 実来院数
  cancelRate: number;        // キャンセル / 予約総数
  cpa: number;               // 広告費 / 実来院数
  roas: number;              // 売上 / 広告費
  avgPrice: number;          // 売上 / 実来院数
  // 広告 API 連携で取れる追加指標 (manual 入力時は 0)
  impressions: number;       // 表示回数
  clicks: number;            // クリック数
  ctr: number;               // クリック率 (%)
  cvr: number;               // コンバージョン率 (%)
  cpm: number;               // 1000 表示単価
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
    cancelStandard: 0,
    cancelSameDay: 0,
    noShow: 0,
    pendingCount: 0,
    adSpend: 0,
    sales: 0,
    consumedSales: 0,
    googleReviewCount: 0,
    hotpepperReviewCount: 0,
    reviewCount: 0,
    joinRate: 0,
    cancelRate: 0,
    cpa: 0,
    roas: 0,
    avgPrice: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cvr: 0,
    cpm: 0,
  };
}

function finalize(t: MarketingTotals): MarketingTotals {
  // CTR / CVR / CPM はバケット集計後に再計算 (集約 impressions / clicks
  // から導出する方が単純平均より正確)。
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const cvr = 0; // 顧客変換は appointments 側に紐付かないので一旦 API 値の合計平均は出さない
  const cpm = t.impressions > 0 ? (t.adSpend / t.impressions) * 1000 : 0;
  return {
    ...t,
    joinRate: t.visitCount > 0 ? t.joinCount / t.visitCount : 0,
    cancelRate:
      t.reservationCount > 0 ? t.cancelCount / t.reservationCount : 0,
    cpa: t.visitCount > 0 ? t.adSpend / t.visitCount : 0,
    roas: t.adSpend > 0 ? t.sales / t.adSpend : 0,
    avgPrice: t.visitCount > 0 ? t.sales / t.visitCount : 0,
    ctr,
    cvr: t.cvr || cvr,
    cpm,
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
  // appointments.start_at は UI から TZ なしの ISO 文字列で書き込まれて
  // いる (= UTC 扱いで保存されるが、クロック値は JST 入力そのもの)。
  // 1 日の切り上げ / 切り下げで +9h シフトを掛けると 15 時台以降が翌日
  // 扱いになってしまうので、先頭 7 文字 (YYYY-MM) をそのまま JST 月と
  // して使う。
  return startAt.slice(0, 7);
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
  // Marketing analytics = 真の新規のみ.
  // Per product spec ("マーケティング分析の実来院などは全て初回の新規の
  // みだけの数をカウントする。キャンセルなども。") every metric on the
  // marketing dashboard — 実来院 / キャンセル / 入会 / 売上 / 予約数 —
  // must only count the customer's FIRST-EVER appointment. Return
  // visits don't belong here.
  //
  // 旧実装は appointments.visit_count = 1 でフィルタしていたが、これは
  // 予約作成時に customer.visit_count + 1 でスタンプされる値で、
  // customer.visit_count は完了時にしか加算されないため、
  //   - 1 回目キャンセル → 2 回目予約 が visit_count=1 で再スタンプ
  //   - レガシーデータで customer.visit_count が 0 のまま
  // のケースで「2 回目以降なのに新規扱い」になってしまい、媒体別内訳の
  // (不明) 行を膨らませる原因になっていた。
  //
  // 新実装: 期間内の予約を一旦 全件取得 → 該当顧客の「全期間の最古の
  // 非キャンセル予約」と照合し、その最古予約自身だけを「新規」として
  // 残す。これで stamped visit_count に依存せず、実際の来店履歴から
  // 「この予約が初回」を判定できる。
  let apptQuery = supabase
    .from("appointments")
    .select(
      "id, customer_id, status, start_at, sales, consumed_amount, visit_source_id, is_member_join, cancelled_at, visit_count"
    )
    .eq("shop_id", shopId)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  if (visitSourceId) {
    apptQuery = apptQuery.eq("visit_source_id", visitSourceId);
  }
  if (staffId) {
    apptQuery = apptQuery.eq("staff_id", staffId);
  }

  // 口コミは customers.google_review_received_at / hotpepper_review_received_at
  // に「受領タイムスタンプ」が立っているレコードを期間で絞って数える。
  // 顧客は shop_id で絞るが、来店経路 (visit_source_id) を持たないので
  // bySource バケットには加算せず、totals + byMonth のみに反映する。
  const reviewsQuery = supabase
    .from("customers")
    .select("google_review_received_at, hotpepper_review_received_at")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .or(
      [
        `and(google_review_received_at.gte.${startTs},google_review_received_at.lt.${endTsExclusive})`,
        `and(hotpepper_review_received_at.gte.${startTs},hotpepper_review_received_at.lt.${endTsExclusive})`,
      ].join(",")
    );

  const [apptRes, sourcesRes, shopRes, adSpendRes, reviewsRes] =
    await Promise.all([
      apptQuery,
      supabase
        .from("visit_sources")
        .select("id, name")
        .eq("shop_id", shopId)
        .is("deleted_at", null),
      supabase.from("shops").select("id, name").eq("id", shopId).maybeSingle(),
      supabase
        .from("ad_spend")
        .select(
          "visit_source_id, year_month, amount, impressions, clicks, conversions, ctr, cvr, cpm"
        )
        .eq("shop_id", shopId)
        .gte("year_month", startMonth)
        .lte("year_month", endMonth)
        .is("deleted_at", null),
      reviewsQuery,
    ]);

  const appointments = apptRes.data ?? [];
  const sources = sourcesRes.data ?? [];
  const adSpendRows = adSpendRes.data ?? [];
  const reviewRows = reviewsRes.data ?? [];

  // 「真の新規」判定用に、期間内予約の顧客 id を抽出して、その顧客たちの
  // 全期間 予約履歴を取得し、各顧客の "最古の予約 id" を求める。
  // キャンセル / no-show も含めて取るのは、「初回キャンセル」も新規予約
  // 1 件として計上したいため (spec: マーケティング分析は新規のみ、
  // キャンセルなども)。
  // 期間内予約のうち、この最古 id と一致するものだけが「人生初の予約
  // = 真の新規」として集計対象になる。
  const customerIdsInPeriod = Array.from(
    new Set(
      (appointments as Array<{ customer_id: number | null }>)
        .map((a) => a.customer_id)
        .filter((id): id is number => id != null)
    )
  );
  const firstEverApptIdByCustomer = new Map<number, number>();
  if (customerIdsInPeriod.length > 0) {
    const { data: histRows } = await supabase
      .from("appointments")
      .select("id, customer_id, start_at")
      .eq("shop_id", shopId)
      .in("customer_id", customerIdsInPeriod)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    type HistRow = {
      id: number;
      customer_id: number;
      start_at: string;
    };
    for (const r of (histRows ?? []) as HistRow[]) {
      if (!firstEverApptIdByCustomer.has(r.customer_id)) {
        firstEverApptIdByCustomer.set(r.customer_id, r.id);
      }
    }
  }

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
    id: number;
    customer_id: number | null;
    status: number;
    start_at: string;
    sales: number | null;
    consumed_amount: number | null;
    visit_source_id: number | null;
    is_member_join: boolean | null;
    visit_count: number | null;
  }>) {
    // 真の新規判定: この予約 id が「顧客の全期間で最古の予約 id」と
    // 一致するときのみ集計に乗せる。キャンセル含む全レコードから最古を
    // 選んでいるので、「初回がキャンセルだった顧客」も新規 1 件として
    // 反映される (spec 通り)。
    //   - customer_id 無しの予約 (slot block 等) は除外
    //   - 期間外の予約は SELECT 段で除外済
    if (a.customer_id == null) continue;
    if (firstEverApptIdByCustomer.get(a.customer_id) !== a.id) continue;
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
      // 内訳ごとに分けて、UI 側でホバー時に「キャンセル X / 当日 Y / no-show Z」
      // として検証できるようにする。
      if (a.status === 3) {
        totals.cancelStandard += 1;
        mb.cancelStandard += 1;
        sb.cancelStandard += 1;
      } else if (a.status === 4) {
        totals.cancelSameDay += 1;
        mb.cancelSameDay += 1;
        sb.cancelSameDay += 1;
      } else if (a.status === 99) {
        totals.noShow += 1;
        mb.noShow += 1;
        sb.noShow += 1;
      }
    } else if (a.status === 0) {
      // 待機 (これから来店予定 / 未処理 = 集計実行前) を残す。
      // 33 - 15 - 3 = 15 のような「埋まらない数字」を即座に説明できる。
      totals.pendingCount += 1;
      mb.pendingCount += 1;
      sb.pendingCount += 1;
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
    if (isComplete && a.consumed_amount) {
      totals.consumedSales += a.consumed_amount;
      mb.consumedSales += a.consumed_amount;
      sb.consumedSales += a.consumed_amount;
    }
    if (a.is_member_join) {
      totals.joinCount += 1;
      mb.joinCount += 1;
      sb.joinCount += 1;
    }
  }

  // 2. Distribute ad_spend into monthly + source buckets
  //    (amount に加えて impressions / clicks / conversions / cvr も合算)
  for (const r of adSpendRows as Array<{
    visit_source_id: number;
    year_month: string;
    amount: number;
    impressions: number | null;
    clicks: number | null;
    conversions: number | null;
    ctr: number | null;
    cvr: number | null;
    cpm: number | null;
  }>) {
    if (visitSourceId && r.visit_source_id !== visitSourceId) continue;
    const imp = r.impressions ?? 0;
    const clk = r.clicks ?? 0;
    const cvrVal = r.cvr ?? 0;
    totals.adSpend += r.amount;
    totals.impressions += imp;
    totals.clicks += clk;
    if (cvrVal > totals.cvr) totals.cvr = cvrVal;
    const mb = monthBuckets.get(r.year_month);
    if (mb) {
      mb.adSpend += r.amount;
      mb.impressions += imp;
      mb.clicks += clk;
      if (cvrVal > mb.cvr) mb.cvr = cvrVal;
    }
    let sb = sourceBuckets.get(r.visit_source_id);
    if (!sb) {
      sb = emptyTotals();
      sourceBuckets.set(r.visit_source_id, sb);
    }
    sb.adSpend += r.amount;
    sb.impressions += imp;
    sb.clicks += clk;
    if (cvrVal > sb.cvr) sb.cvr = cvrVal;
  }

  // 2.5. 口コミ受領数を totals + byMonth に集計。
  // 1 顧客で G と H 両方の受領日が立っていたら両方カウント (= 合計に
  // 2 加算される)。月バケットへの分配は受領タイムスタンプの先頭 7 文字
  // (YYYY-MM) を JST 月として使用 (appointmentYearMonth と同じ方針)。
  for (const r of reviewRows as Array<{
    google_review_received_at: string | null;
    hotpepper_review_received_at: string | null;
  }>) {
    const gAt = r.google_review_received_at;
    if (gAt && gAt >= startTs && gAt < endTsExclusive) {
      totals.googleReviewCount += 1;
      totals.reviewCount += 1;
      const ym = gAt.slice(0, 7);
      const mb = monthBuckets.get(ym);
      if (mb) {
        mb.googleReviewCount += 1;
        mb.reviewCount += 1;
      }
    }
    const hAt = r.hotpepper_review_received_at;
    if (hAt && hAt >= startTs && hAt < endTsExclusive) {
      totals.hotpepperReviewCount += 1;
      totals.reviewCount += 1;
      const ym = hAt.slice(0, 7);
      const mb = monthBuckets.get(ym);
      if (mb) {
        mb.hotpepperReviewCount += 1;
        mb.reviewCount += 1;
      }
    }
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
