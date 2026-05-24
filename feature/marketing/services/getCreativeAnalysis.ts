"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * クリエイティブ分析サービス (マーケティング → クリエイティブ分析タブ).
 *
 * 強制リンク (booking_links) を「Meta 等の広告 クリエイティブ 1 つにつき
 * 1 リンク」運用とした上で、(症状 × オファー価格 × 店舗) 軸で
 *   - 予約数 / 実来院 / 入会数 / 入会率 / キャンセル率
 *   - 広告費 / CPA / 売上 / ROAS
 * を集計する。
 *
 * 入会判定は他タブと統一: 顧客レベルのライフタイム判定
 * (customer_plans 持ち OR 任意の予約で is_member_join=true)。
 *
 * 新規 attribution も他タブと統一: 顧客の人生最古 status=2 (完了) 予約 id 一致。
 * 媒体集計と異なり、ここでは「booking_link_id でその予約が来た強制リンク」を
 * 主軸にしてグルーピングする (1 顧客 1 新規)。
 */

export interface CreativeBucket {
  /** 集計単位の識別 (UI でユニークキーに使う) */
  key: string;
  // 軸 (UI 表示用)
  shopId: number | null;
  shopName: string | null;
  visitSourceId: number | null;
  visitSourceName: string | null;
  symptom: string | null;
  symptomName: string | null;
  offerPrice: number | null;
  // バケットを構成する強制リンクの一覧 (UI でホバー時の内訳に使う)
  bookingLinkIds: number[];
  bookingLinkTitles: string[];
  // 指標
  reservationCount: number; // 新規 attempt 数 (新規完了 + キャンセル + 待機)
  visitCount: number;       // 新規実来院 (= 最古完了)
  cancelCount: number;      // 新規顧客の attempt のうち キャンセル系 (3/4/99)
  joinCount: number;        // 新規顧客のうちライフタイムで入会済み
  sales: number;            // 新規顧客の最古完了予約の sales
  adSpend: number;          // 広告費合計
  cpa: number;              // adSpend / visitCount
  joinRate: number;         // joinCount / visitCount
  cancelRate: number;       // cancelCount / reservationCount
  roas: number;             // sales / adSpend
}

export interface CreativeAnalysisData {
  rows: CreativeBucket[];
  totals: Omit<CreativeBucket, "key" | "shopId" | "shopName" | "visitSourceId" | "visitSourceName" | "symptom" | "symptomName" | "offerPrice" | "bookingLinkIds" | "bookingLinkTitles">;
  meta: {
    brandId: number;
    startMonth: string;
    endMonth: string;
    /** 利用可能な症状コード一覧 (UI の絞り込みに使う) */
    symptoms: Array<{ code: string; name: string }>;
  };
}

function emptyBucket(): Omit<CreativeBucket, "key" | "shopId" | "shopName" | "visitSourceId" | "visitSourceName" | "symptom" | "symptomName" | "offerPrice" | "bookingLinkIds" | "bookingLinkTitles"> {
  return {
    reservationCount: 0,
    visitCount: 0,
    cancelCount: 0,
    joinCount: 0,
    sales: 0,
    adSpend: 0,
    cpa: 0,
    joinRate: 0,
    cancelRate: 0,
    roas: 0,
  };
}

function finalize<T extends ReturnType<typeof emptyBucket>>(b: T): T {
  return {
    ...b,
    cpa: b.visitCount > 0 ? b.adSpend / b.visitCount : 0,
    joinRate: b.visitCount > 0 ? b.joinCount / b.visitCount : 0,
    cancelRate:
      b.reservationCount > 0 ? b.cancelCount / b.reservationCount : 0,
    roas: b.adSpend > 0 ? b.sales / b.adSpend : 0,
  };
}

export async function getCreativeAnalysis(params: {
  brandId: number;
  startMonth: string;        // 'YYYY-MM'
  endMonth: string;          // 'YYYY-MM' (inclusive)
  shopId?: number | null;    // null/undefined = ブランド全店
  symptom?: string | null;
  offerPrice?: number | null;
}): Promise<CreativeAnalysisData> {
  const { brandId, startMonth, endMonth, shopId, symptom, offerPrice } = params;
  const supabase = await createClient();

  const startTs = `${startMonth}-01T00:00:00+09:00`;
  const [ey, em] = endMonth.split("-").map(Number);
  const nextY = em === 12 ? ey + 1 : ey;
  const nextM = em === 12 ? 1 : em + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  // 1. 対象ブランドの 強制リンク を症状/オファー条件で絞って取得
  let linkQ = supabase
    .from("booking_links")
    .select("id, title, shop_id, shop_ids, symptom, offer_price, visit_source_id")
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (symptom) linkQ = linkQ.eq("symptom", symptom);
  if (offerPrice != null) linkQ = linkQ.eq("offer_price", offerPrice);
  const { data: linksRaw } = await linkQ;
  type LinkRow = {
    id: number;
    title: string;
    shop_id: number | null;
    shop_ids: number[] | null;
    symptom: string | null;
    offer_price: number | null;
    visit_source_id: number | null;
  };
  const links = ((linksRaw ?? []) as LinkRow[]).filter((l) => {
    if (shopId == null) return true;
    const ids = Array.isArray(l.shop_ids) ? l.shop_ids : [];
    if (ids.length > 0) return ids.includes(shopId);
    return l.shop_id == null || l.shop_id === shopId;
  });

  // 2. 期間内の appointments (booking_link_id がある = この強制リンク経由) を取得
  //    + ライフタイム attribution 用の補助クエリを並列実行
  const linkIds = links.map((l) => l.id);
  const linkIdSet = new Set(linkIds);
  const symptomMapRes = supabase
    .from("creative_symptoms")
    .select("code, name")
    .is("deleted_at", null)
    .order("sort_number");

  if (linkIds.length === 0) {
    const symptomsRow = await symptomMapRes;
    return {
      rows: [],
      totals: emptyBucket(),
      meta: {
        brandId,
        startMonth,
        endMonth,
        symptoms: (symptomsRow.data ?? []) as Array<{
          code: string;
          name: string;
        }>,
      },
    };
  }

  // 期間内 appointments (status 全て、新規/キャンセル/待機の分類用)
  let apptQ = supabase
    .from("appointments")
    .select(
      "id, customer_id, shop_id, status, sales, start_at, booking_link_id"
    )
    .eq("brand_id", brandId)
    .in("booking_link_id", linkIds)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  if (shopId != null) apptQ = apptQ.eq("shop_id", shopId);
  // links が参照している visit_source_id の一意集合を取得 (media 名解決用)
  const visitSourceIds = Array.from(
    new Set(
      links
        .map((l) => l.visit_source_id)
        .filter((id): id is number => id != null)
    )
  );
  const visitSourcesRes =
    visitSourceIds.length > 0
      ? supabase
          .from("visit_sources")
          .select("id, name")
          .in("id", visitSourceIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }> });

  let [apptRes, symptomsRes, shopsRes, vsRes] = await Promise.all([
    apptQ,
    symptomMapRes,
    supabase
      .from("shops")
      .select("id, name")
      .eq("brand_id", brandId)
      .is("deleted_at", null),
    visitSourcesRes,
  ]);
  // migration 00052 未適用環境では appointments.booking_link_id が無く
  // SELECT が失敗する。その場合は空配列で続行 (= 表示は 0 件のまま
  // クラッシュさせない)。アプリ画面側にバナーは出していないが、開発時
  // のデバッグログだけ残す。
  if (
    apptRes.error &&
    apptRes.error.message?.includes("booking_link_id") &&
    (apptRes.error.message.includes("column") ||
      apptRes.error.message.includes("schema cache"))
  ) {
    console.error(
      "[getCreativeAnalysis] appointments.booking_link_id 未適用: migration 00052 を実行してください",
      apptRes.error.message
    );
    apptRes = { data: [], error: null } as typeof apptRes;
  }

  type ApptRow = {
    id: number;
    customer_id: number | null;
    shop_id: number;
    status: number;
    sales: number | null;
    start_at: string;
    booking_link_id: number | null;
  };
  const appts = (apptRes.data ?? []) as ApptRow[];

  // 顧客 id 集合 → 全期間 status=2 履歴 + ライフタイム入会フラグ
  const customerIds = Array.from(
    new Set(
      appts
        .map((a) => a.customer_id)
        .filter((id): id is number => id != null)
    )
  );
  const firstCompletedApptIdByCustomer = new Map<number, number>();
  const customerEverJoined = new Set<number>();
  if (customerIds.length > 0) {
    const [hist, plans, joinApts] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, customer_id, start_at")
        .eq("brand_id", brandId)
        .eq("status", 2)
        .in("customer_id", customerIds)
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
      supabase
        .from("customer_plans")
        .select("customer_id")
        .in("customer_id", customerIds)
        .is("deleted_at", null),
      supabase
        .from("appointments")
        .select("customer_id")
        .eq("brand_id", brandId)
        .eq("is_member_join", true)
        .in("customer_id", customerIds)
        .is("deleted_at", null),
    ]);
    for (const r of (hist.data ?? []) as Array<{
      id: number;
      customer_id: number;
    }>) {
      if (!firstCompletedApptIdByCustomer.has(r.customer_id)) {
        firstCompletedApptIdByCustomer.set(r.customer_id, r.id);
      }
    }
    for (const r of (plans.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(r.customer_id);
    }
    for (const r of (joinApts.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(r.customer_id);
    }
  }

  // 3. 期間内 ad_spend (booking_link_id NOT NULL のみ)
  const { data: adSpendRows } = await supabase
    .from("ad_spend")
    .select("booking_link_id, year_month, amount")
    .eq("brand_id", brandId)
    .in("booking_link_id", linkIds)
    .gte("year_month", startMonth)
    .lte("year_month", endMonth)
    .is("deleted_at", null);

  // 4. shop / symptom lookup
  const shopMap = new Map<number, string>(
    (shopsRes.data ?? []).map((s) => [s.id as number, s.name as string])
  );
  const symptomMap = new Map<string, string>(
    ((symptomsRes.data ?? []) as Array<{ code: string; name: string }>).map(
      (s) => [s.code, s.name]
    )
  );
  const visitSourceMap = new Map<number, string>(
    ((vsRes.data ?? []) as Array<{ id: number; name: string }>).map((s) => [
      s.id,
      s.name,
    ])
  );
  const linkById = new Map<number, LinkRow>(links.map((l) => [l.id, l]));

  // 5. バケットキー = (shop_id, visit_source_id, symptom, offer_price) 単位
  type Bucket = ReturnType<typeof emptyBucket> & {
    shopId: number | null;
    shopName: string | null;
    visitSourceId: number | null;
    visitSourceName: string | null;
    symptom: string | null;
    symptomName: string | null;
    offerPrice: number | null;
    bookingLinkIds: Set<number>;
    bookingLinkTitles: Set<string>;
  };
  function keyOf(
    shop: number | null,
    source: number | null,
    sym: string | null,
    price: number | null
  ) {
    return `${shop ?? "_"}::${source ?? "_"}::${sym ?? "_"}::${price ?? "_"}`;
  }
  const bucketMap = new Map<string, Bucket>();
  function getBucket(
    shop: number | null,
    source: number | null,
    sym: string | null,
    price: number | null
  ): Bucket {
    const k = keyOf(shop, source, sym, price);
    let b = bucketMap.get(k);
    if (!b) {
      b = {
        ...emptyBucket(),
        shopId: shop,
        shopName: shop != null ? shopMap.get(shop) ?? null : null,
        visitSourceId: source,
        visitSourceName:
          source != null ? visitSourceMap.get(source) ?? null : null,
        symptom: sym,
        symptomName: sym ? symptomMap.get(sym) ?? sym : null,
        offerPrice: price,
        bookingLinkIds: new Set(),
        bookingLinkTitles: new Set(),
      };
      bucketMap.set(k, b);
    }
    return b;
  }

  // 5a. 期間内 new attribution → 各 appt が新規顧客の最古完了かどうかを判定
  const newCustomerIds = new Set<number>();
  for (const a of appts) {
    if (a.customer_id == null) continue;
    if (firstCompletedApptIdByCustomer.get(a.customer_id) === a.id) {
      newCustomerIds.add(a.customer_id);
    }
  }

  for (const a of appts) {
    if (a.customer_id == null) continue;
    if (!a.booking_link_id) continue;
    const link = linkById.get(a.booking_link_id);
    if (!link) continue;

    // バケットの軸はリンクの shop_id / visit_source_id / symptom / offer_price。
    // リンクが shop_ids 配列を持つ場合は予約自身の shop_id を使う。
    const bucketShop = link.shop_id ?? a.shop_id;
    const b = getBucket(
      bucketShop,
      link.visit_source_id,
      link.symptom,
      link.offer_price
    );
    b.bookingLinkIds.add(link.id);
    b.bookingLinkTitles.add(link.title);

    const isNew =
      firstCompletedApptIdByCustomer.get(a.customer_id) === a.id;
    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isPending = a.status === 0;

    if (isNew) {
      // 最古完了予約 (= status=2 確定): 予約 = 実来院 = 1 として加算
      b.reservationCount += 1;
      b.visitCount += 1;
      if (a.sales) b.sales += a.sales;
      if (customerEverJoined.has(a.customer_id)) b.joinCount += 1;
    } else if (
      newCustomerIds.has(a.customer_id) &&
      (isCancel || isPending)
    ) {
      // 新規顧客の attempt (キャンセル / 待機)
      b.reservationCount += 1;
      if (isCancel) b.cancelCount += 1;
    }
  }

  // 5b. 広告費を割り付ける (リンクが属するバケットに加算)
  for (const r of (adSpendRows ?? []) as Array<{
    booking_link_id: number;
    year_month: string;
    amount: number;
  }>) {
    if (!linkIdSet.has(r.booking_link_id)) continue;
    const link = linkById.get(r.booking_link_id);
    if (!link) continue;
    const b = getBucket(
      link.shop_id,
      link.visit_source_id,
      link.symptom,
      link.offer_price
    );
    b.adSpend += r.amount;
  }

  // 6. 結果を配列化 + ソート (売上 desc → adSpend desc)
  const rows: CreativeBucket[] = Array.from(bucketMap.entries())
    .map(([key, b]) => {
      const finalized = finalize(b);
      return {
        key,
        shopId: b.shopId,
        shopName: b.shopName,
        visitSourceId: b.visitSourceId,
        visitSourceName: b.visitSourceName,
        symptom: b.symptom,
        symptomName: b.symptomName,
        offerPrice: b.offerPrice,
        bookingLinkIds: [...b.bookingLinkIds].sort((a, c) => a - c),
        bookingLinkTitles: [...b.bookingLinkTitles],
        reservationCount: finalized.reservationCount,
        visitCount: finalized.visitCount,
        cancelCount: finalized.cancelCount,
        joinCount: finalized.joinCount,
        sales: finalized.sales,
        adSpend: finalized.adSpend,
        cpa: finalized.cpa,
        joinRate: finalized.joinRate,
        cancelRate: finalized.cancelRate,
        roas: finalized.roas,
      };
    })
    .sort((a, c) => c.sales - a.sales || c.adSpend - a.adSpend);

  // Totals
  const totalsRaw = emptyBucket();
  for (const r of rows) {
    totalsRaw.reservationCount += r.reservationCount;
    totalsRaw.visitCount += r.visitCount;
    totalsRaw.cancelCount += r.cancelCount;
    totalsRaw.joinCount += r.joinCount;
    totalsRaw.sales += r.sales;
    totalsRaw.adSpend += r.adSpend;
  }
  const totals = finalize(totalsRaw);

  return {
    rows,
    totals,
    meta: {
      brandId,
      startMonth,
      endMonth,
      symptoms: (symptomsRes.data ?? []) as Array<{
        code: string;
        name: string;
      }>,
    },
  };
}
