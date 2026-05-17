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
  /**
   * 新規数 (= 1 カルテ = 1 count)。
   * 顧客の人生最古の予約 (any status) が当月にある人数。
   * 内訳: visitCount + cancelCount + remainingCount = firstApptCount。
   */
  firstApptCount: number;
  /** 実来院数 = 新規顧客の初回予約 status=2 (完了) の人数 */
  visitCount: number;
  /** 残り新規 = 新規 - 実来院 - キャンセル (まだ来店も取消もしていない予約) */
  remainingCount: number;
  /**
   * 残2クロ = 当月新規 (人生最古予約が当月) のうち、
   *   1) 会員/回数券などのチケット未購入 (= 入会フラグも customer_plans もない)
   *   2) 2 回目の予約が入っている (非キャンセル)
   *   3) その 2 回目の予約日が未経過 (= 未来日付)
   * を満たす人数。「次回来店時にチケットを購入するかどうかを決める予定の人」
   * = クロージング機会の可視化用 KPI。
   */
  pendingSecondClose: number;
  /** 後方互換: firstApptCount と同値。reservationCount を参照する古いコード用。 */
  reservationCount: number;
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
    firstApptCount: 0,
    visitCount: 0,
    remainingCount: 0,
    pendingSecondClose: 0,
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
  // reservationCount は新規数 (firstApptCount) に揃える (後方互換 + 分母用)。
  const reservationCount = t.firstApptCount;
  return {
    ...t,
    reservationCount,
    joinRate: t.visitCount > 0 ? t.joinCount / t.visitCount : 0,
    cancelRate:
      reservationCount > 0 ? t.cancelCount / reservationCount : 0,
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
  // Marketing analytics = "真の新規" (the customer's first ever completed
  // visit, status=2). キャンセル / no-show / pending は新規としてカウント
  // しない。
  //
  // 新規 attribution:
  //   - その顧客の人生で最初に status=2 (完了) になった予約だけを
  //     「新規 1 件」として全 KPI (実来院 / 売上 / 入会 / キャンセル) に
  //     乗せる。
  //   - 媒体 (visit_source_id) は最古完了予約のものをそのまま使う。
  //   - 入会/購入 (joinCount) は顧客レベルでライフタイム判定する。
  //     具体的には「customer_plans を 1 つでも持つ」または「is_member_join
  //     = true な予約を 1 つでも持つ」顧客を入会扱い。
  //     例: 5/30 に新規来店した A さんが 6/10 にサブスク購入した場合、
  //          5/30 の新規データに入会フラグが付き、5 月の新規 1 件 +
  //          5 月の入会 1 件として集計される。
  //
  // 旧実装の問題点:
  //   - visit_count=1 はキャンセルで再スタンプされるケースがあり信頼性が低い
  //   - "最古予約 id (キャンセル含む)" 方式は「初回キャンセル → 後日完了」
  //     な顧客を新規としてカウントしない (= 真の新規が漏れる)
  //   - 入会判定が予約自身の is_member_join フラグだけだと、2 回目以降に
  //     入会した新規顧客が拾えない
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

  // 「真の新規」判定用に、期間内予約の顧客 id を抽出し、その顧客たちの
  // 全期間 status=2 (完了) 予約と、ライフタイム入会判定を取得する。
  //   - firstCompletedApptIdByCustomer: 顧客が人生で初めて完了した予約 id
  //     (= 新規 1 件として集計対象になる appointment)
  //   - customerEverJoined: いつかの時点で入会/購入した顧客 id Set
  //     (= customer_plans 持ちor is_member_join=true 予約持ち)
  const customerIdsInPeriod = Array.from(
    new Set(
      (appointments as Array<{ customer_id: number | null }>)
        .map((a) => a.customer_id)
        .filter((id): id is number => id != null)
    )
  );
  // 各顧客の "人生最古の予約" (any status) を求める。これが新規 attribution
  // の基礎: その最古予約が当月にあれば、顧客は当月新規。
  // 最古予約の status で 実来院 / キャンセル / 残り新規 を振り分ける。
  type FirstApptInfo = {
    id: number;
    status: number;
    start_at: string;
    visit_source_id: number | null;
  };
  const firstApptByCustomer = new Map<number, FirstApptInfo>();
  // 顧客 → "その顧客を連れてきた媒体" の解決マップ。
  // 優先順位 (最初に見つかったもの):
  //   1. customers.first_visit_source_id (顧客作成時に記録された初回媒体)
  //   2. 人生最古予約 (any status) の visit_source_id
  //   3. 期間内予約の visit_source_id (フォールバック)
  const customerSourceMap = new Map<number, number | null>();
  const customerEverJoined = new Set<number>();
  // 顧客 → 1〜3 回目までの status=2 予約 id 集合。
  // 「3 回目来店までを新規売上に含める」運用に合わせる (経営指標 /
  // 売上 ダッシュボードと統一)。
  const firstThreeCompletedApptIds = new Map<number, Set<number>>();
  // 顧客 → 全期間の予約 (status 含む) 昇順リスト。
  // 残2クロ判定 (= 2 回目予約が未来か) で使う。
  type ApptHistRow = {
    id: number;
    status: number;
    start_at: string;
  };
  const apptsByCustomer = new Map<number, ApptHistRow[]>();
  if (customerIdsInPeriod.length > 0) {
    const [histRes, plansRes, joinFlagApptsRes, customersRes] =
      await Promise.all([
        // 顧客の全期間 全予約 (start_at 昇順) → 各顧客の最古予約 + 媒体
        supabase
          .from("appointments")
          .select("id, customer_id, start_at, status, visit_source_id")
          .eq("shop_id", shopId)
          .in("customer_id", customerIdsInPeriod)
          .is("deleted_at", null)
          .order("start_at", { ascending: true }),
      // 顧客のライフタイム プラン購入有無
      supabase
        .from("customer_plans")
        .select("customer_id")
        .in("customer_id", customerIdsInPeriod)
        .is("deleted_at", null),
      // 顧客のライフタイム is_member_join=true 予約有無
      supabase
        .from("appointments")
        .select("customer_id")
        .eq("shop_id", shopId)
        .eq("is_member_join", true)
        .in("customer_id", customerIdsInPeriod)
        .is("deleted_at", null),
      // 顧客マスタの first_visit_source_id (顧客作成時に記録された
      // 初回経路) を最優先のソース解決に使う。
      supabase
        .from("customers")
        .select("id, first_visit_source_id")
        .in("id", customerIdsInPeriod),
    ]);
    // 1) customers.first_visit_source_id を最優先で詰める
    for (const r of (customersRes.data ?? []) as Array<{
      id: number;
      first_visit_source_id: number | null;
    }>) {
      if (r.first_visit_source_id != null) {
        customerSourceMap.set(r.id, r.first_visit_source_id);
      }
    }
    // 2) 人生最古予約 (start_at 昇順なので最初に出会ったものが最古) を確定
    //    + ソース未確定の顧客に補完
    //    + 1〜3 回目 status=2 集合 (firstThreeCompletedApptIds) も同時構築
    for (const r of (histRes.data ?? []) as Array<{
      id: number;
      customer_id: number;
      start_at: string;
      status: number;
      visit_source_id: number | null;
    }>) {
      if (!firstApptByCustomer.has(r.customer_id)) {
        firstApptByCustomer.set(r.customer_id, {
          id: r.id,
          status: r.status,
          start_at: r.start_at,
          visit_source_id: r.visit_source_id,
        });
        if (
          !customerSourceMap.has(r.customer_id) &&
          r.visit_source_id != null
        ) {
          customerSourceMap.set(r.customer_id, r.visit_source_id);
        }
      }
      if (r.status === 2) {
        const set =
          firstThreeCompletedApptIds.get(r.customer_id) ?? new Set();
        if (set.size < 3) {
          set.add(r.id);
          firstThreeCompletedApptIds.set(r.customer_id, set);
        }
      }
      // 全予約 (status 関係なく) を顧客別リストに積む
      const arr = apptsByCustomer.get(r.customer_id) ?? [];
      arr.push({ id: r.id, status: r.status, start_at: r.start_at });
      apptsByCustomer.set(r.customer_id, arr);
    }
    for (const r of (plansRes.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(r.customer_id);
    }
    for (const r of (joinFlagApptsRes.data ?? []) as Array<{
      customer_id: number;
    }>) {
      customerEverJoined.add(r.customer_id);
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

  // 残2クロ判定で「2 回目の予約が未来か」を見るための現在時刻 (ISO 文字列)。
  const nowIso = new Date().toISOString();

  // メイン集計ループ: 顧客の人生最古予約 1 件 = 新規 1 件として扱う。
  //   - 新規数: 当月に最古予約がある顧客 (1 カルテ = 1 count)
  //   - 実来院: その最古予約が status=2 (完了)
  //   - キャンセル: status ∈ {3, 4, 99}
  //   - 残り新規: status ∈ {0, 1} (まだ来店も取消もしていない)
  //   - 売上: 実来院 (status=2) の sales のみ集計
  //   - 入会: 当該新規顧客がライフタイムで入会していれば +1 (バックアタッチ)
  //   - 媒体: customerSourceMap → 予約自身 → 0 (= (不明))
  for (const [customerId, first] of firstApptByCustomer) {
    // 当月以前に最古予約がある顧客 = リピータなので除外。
    if (first.start_at < startTs || first.start_at >= endTsExclusive) continue;

    const ym = appointmentYearMonth(first.start_at);
    const mb = monthBuckets.get(ym) ?? (() => {
      const b = emptyTotals();
      monthBuckets.set(ym, b);
      return b;
    })();
    const sid = customerSourceMap.get(customerId) ?? first.visit_source_id ?? 0;
    let sb = sourceBuckets.get(sid);
    if (!sb) {
      sb = emptyTotals();
      sourceBuckets.set(sid, sb);
    }

    // 新規 +1 (1 カルテ = 1 count)
    totals.firstApptCount += 1;
    mb.firstApptCount += 1;
    sb.firstApptCount += 1;

    // 残2クロ判定: チケット未購入かつ 2 回目の予約が未来日付の新規顧客。
    // 「次回来店時にチケット買うかどうか決める予定の人」= クロージング機会。
    if (!customerEverJoined.has(customerId)) {
      const list = apptsByCustomer.get(customerId) ?? [];
      // キャンセル系を除いた予定順 (start_at 昇順) で 2 番目を取る
      const nonCancel = list.filter(
        (a) => a.status !== 3 && a.status !== 4 && a.status !== 99
      );
      const second = nonCancel[1];
      if (second && second.start_at > nowIso) {
        totals.pendingSecondClose += 1;
        mb.pendingSecondClose += 1;
        sb.pendingSecondClose += 1;
      }
    }

    // 最古予約の status で 実来院 / キャンセル / 残り新規 を振り分け
    const status = first.status;
    const isCancel = status === 3 || status === 4 || status === 99;
    if (status === 2) {
      totals.visitCount += 1;
      mb.visitCount += 1;
      sb.visitCount += 1;
      // 入会判定は実来院した新規にだけ加算する。
      // 売上 / 消化売上 は 1〜3 回目来店ベースで別ループで集計するので
      // ここでは積まない (経営指標 / 売上 ダッシュボードと統一)。
      if (customerEverJoined.has(customerId)) {
        totals.joinCount += 1;
        mb.joinCount += 1;
        sb.joinCount += 1;
      }
    } else if (isCancel) {
      totals.cancelCount += 1;
      mb.cancelCount += 1;
      sb.cancelCount += 1;
      if (status === 3) {
        totals.cancelStandard += 1;
        mb.cancelStandard += 1;
        sb.cancelStandard += 1;
      } else if (status === 4) {
        totals.cancelSameDay += 1;
        mb.cancelSameDay += 1;
        sb.cancelSameDay += 1;
      } else {
        totals.noShow += 1;
        mb.noShow += 1;
        sb.noShow += 1;
      }
    } else {
      // status 0 (待機) / 1 (施術中) → まだ確定していない = 残り新規
      totals.remainingCount += 1;
      mb.remainingCount += 1;
      sb.remainingCount += 1;
      totals.pendingCount += 1;
      mb.pendingCount += 1;
      sb.pendingCount += 1;
    }
  }

  // 1.6. 売上 / 消化売上は「顧客の人生 1〜3 回目 status=2 予約」の sales を
  //      合算する (経営指標 / 売上 ダッシュボードと統一)。
  //      1 回目だけでなく 2 / 3 回目で回数券購入する新規顧客もいるため、
  //      新規獲得期間として 3 回目までを「新規売上」に含める。
  //      バケット (bySource / byMonth) への分配は customerSourceMap (顧客の
  //      初回媒体) を最優先、無ければ予約自身の visit_source_id にフォール
  //      バック。
  for (const a of appointments as Array<{
    id: number;
    customer_id: number | null;
    status: number;
    start_at: string;
    sales: number | null;
    consumed_amount: number | null;
    visit_source_id: number | null;
  }>) {
    if (a.status !== 2) continue;
    if (a.customer_id == null) continue;
    const first3 = firstThreeCompletedApptIds.get(a.customer_id);
    if (!first3 || !first3.has(a.id)) continue;

    const ym = appointmentYearMonth(a.start_at);
    const mb = monthBuckets.get(ym) ?? (() => {
      const b = emptyTotals();
      monthBuckets.set(ym, b);
      return b;
    })();
    const sid =
      customerSourceMap.get(a.customer_id) ?? a.visit_source_id ?? 0;
    let sb = sourceBuckets.get(sid);
    if (!sb) {
      sb = emptyTotals();
      sourceBuckets.set(sid, sb);
    }
    if (a.sales) {
      totals.sales += a.sales;
      mb.sales += a.sales;
      sb.sales += a.sales;
    }
    if (a.consumed_amount) {
      totals.consumedSales += a.consumed_amount;
      mb.consumedSales += a.consumed_amount;
      sb.consumedSales += a.consumed_amount;
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
