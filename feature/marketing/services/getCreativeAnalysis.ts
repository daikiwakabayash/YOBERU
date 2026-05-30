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
 * ■ 媒体別内訳 (getMarketingData) との整合性
 * 本サービスは getMarketingData と「全く同じ attribution」で集計し、
 * その内訳を「どの強制リンク経由か」で更に分解したものになる。これにより
 * クリエイティブ分析の合計 = 媒体別内訳の合計 となり、両画面の乖離が
 * 「強制リンクに紐づかない (= booking_link_id が無い) 予約がどれだけある
 * か」だけになる。
 *
 *   - 新規 (= 予約数) : 顧客の人生最古予約 (status 不問) が当期間にある人数
 *   - 実来院         : その最古予約が status=2 (完了) の人数
 *   - キャンセル     : その最古予約が status ∈ {3,4,99}
 *   - 入会           : 上記の実来院した新規顧客のうちライフタイム入会済み
 *   - 売上           : 顧客の人生 1〜3 回目 status=2 予約の sales (当期間分)
 *
 * ■ 未割当 (強制リンクなし) バケット
 * booking_link_id を持たない予約 (= 手動登録 / migration 00052 以前の予約 /
 * 媒体直来店など) は特定のクリエイティブに紐付けられないため、
 * (店舗 × 媒体) 単位の「未割当」バケットにまとめて計上する。これにより
 * 全体の合計が媒体別内訳と一致し、「どれだけがクリエイティブに attribution
 * できていないか」が一目で分かる。
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
  /** 強制リンクに紐付かない「未割当」バケットかどうか */
  unassigned: boolean;
  // バケットを構成する強制リンクの一覧 (UI でホバー時の内訳に使う)
  bookingLinkIds: number[];
  bookingLinkTitles: string[];
  // 指標
  reservationCount: number; // 新規 (= 人生最古予約が当期間にある顧客数)
  visitCount: number;       // 新規実来院 (= 最古予約が status=2)
  cancelCount: number;      // 新規顧客の最古予約が キャンセル系 (3/4/99)
  joinCount: number;        // 新規実来院のうちライフタイムで入会済み
  sales: number;            // 1〜3 回目 status=2 予約の sales (当期間分)
  adSpend: number;          // 広告費合計
  cpa: number;              // adSpend / visitCount
  joinRate: number;         // joinCount / visitCount
  cancelRate: number;       // cancelCount / reservationCount
  roas: number;             // sales / adSpend
}

type BucketMetrics = Omit<
  CreativeBucket,
  | "key"
  | "shopId"
  | "shopName"
  | "visitSourceId"
  | "visitSourceName"
  | "symptom"
  | "symptomName"
  | "offerPrice"
  | "unassigned"
  | "bookingLinkIds"
  | "bookingLinkTitles"
>;

export interface CreativeAnalysisData {
  rows: CreativeBucket[];
  totals: BucketMetrics;
  meta: {
    brandId: number;
    startMonth: string;
    endMonth: string;
    /** 利用可能な症状コード一覧 (UI の絞り込みに使う) */
    symptoms: Array<{ code: string; name: string }>;
  };
}

function emptyBucket(): BucketMetrics {
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

function finalize<T extends BucketMetrics>(b: T): T {
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

  // 症状 / オファー価格でフィルタしているときは「未割当 (= 症状なし)」を
  // 出すと矛盾するので、creative バケットのみ表示する。
  const filtered = symptom != null || offerPrice != null;

  const startTs = `${startMonth}-01T00:00:00+09:00`;
  const [ey, em] = endMonth.split("-").map(Number);
  const nextY = em === 12 ? ey + 1 : ey;
  const nextM = em === 12 ? 1 : em + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  // ---------------------------------------------------------------------------
  // 1. 対象ブランドの 強制リンク を症状/オファー条件で絞って取得
  // ---------------------------------------------------------------------------
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
  const linkById = new Map<number, LinkRow>(links.map((l) => [l.id, l]));
  const linkIds = links.map((l) => l.id);
  const linkIdSet = new Set(linkIds);

  const symptomMapRes = supabase
    .from("creative_symptoms")
    .select("code, name")
    .is("deleted_at", null)
    .order("sort_number");

  // ---------------------------------------------------------------------------
  // 2. 当期間に予約がある顧客 id を集める (媒体別内訳 getMarketingData と同様、
  //    まず期間内予約 → その顧客のライフタイム履歴を引く 2 段構え)
  // ---------------------------------------------------------------------------
  let periodApptQ = supabase
    .from("appointments")
    .select("customer_id")
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  periodApptQ =
    shopId != null
      ? periodApptQ.eq("shop_id", shopId)
      : periodApptQ.eq("brand_id", brandId);

  const [periodRes, symptomsRes, shopsRes] = await Promise.all([
    periodApptQ,
    symptomMapRes,
    supabase
      .from("shops")
      .select("id, name")
      .eq("brand_id", brandId)
      .is("deleted_at", null),
  ]);

  const customerIds = Array.from(
    new Set(
      ((periodRes.data ?? []) as Array<{ customer_id: number | null }>)
        .map((a) => a.customer_id)
        .filter((id): id is number => id != null)
    )
  );

  // ---------------------------------------------------------------------------
  // 3. 顧客のライフタイム履歴 (= 最古予約 / 1〜3 回目完了 / 入会判定 / 初回媒体)
  // ---------------------------------------------------------------------------
  type FirstApptInfo = {
    id: number;
    status: number;
    start_at: string;
    visit_source_id: number | null;
    shop_id: number | null;
    booking_link_id: number | null;
  };
  type HistRow = {
    id: number;
    customer_id: number;
    start_at: string;
    status: number;
    sales: number | null;
    visit_source_id: number | null;
    shop_id: number | null;
    booking_link_id: number | null;
  };

  const firstApptByCustomer = new Map<number, FirstApptInfo>();
  const firstThreeCompleted = new Map<number, Set<number>>();
  const customerSourceMap = new Map<number, number | null>();
  const customerEverJoined = new Set<number>();
  // 1〜3 回目 status=2 予約 id → その予約行 (売上集計に使う)
  let histRows: HistRow[] = [];

  if (customerIds.length > 0) {
    // 履歴クエリ: booking_link_id を含めて取得。00052 未適用環境では
    // カラムが無く失敗するので、その場合は外して再取得し null 扱いにする。
    const baseHistSelect =
      "id, customer_id, start_at, status, sales, visit_source_id, shop_id";
    const scopeCol = shopId != null ? "shop_id" : "brand_id";
    const scopeVal = shopId != null ? shopId : brandId;

    async function fetchHist(withLink: boolean) {
      const sel = withLink
        ? `${baseHistSelect}, booking_link_id`
        : baseHistSelect;
      return supabase
        .from("appointments")
        .select(sel)
        .eq(scopeCol, scopeVal)
        .in("customer_id", customerIds)
        .is("deleted_at", null)
        .order("start_at", { ascending: true });
    }

    let histRes = await fetchHist(true);
    if (
      histRes.error &&
      histRes.error.message?.includes("booking_link_id") &&
      (histRes.error.message.includes("column") ||
        histRes.error.message.includes("schema cache"))
    ) {
      console.error(
        "[getCreativeAnalysis] appointments.booking_link_id 未適用: migration 00052 を実行してください",
        histRes.error.message
      );
      histRes = await fetchHist(false);
    }

    histRows = ((histRes.data ?? []) as Array<Record<string, unknown>>).map(
      (r) => ({
        id: r.id as number,
        customer_id: r.customer_id as number,
        start_at: r.start_at as string,
        status: r.status as number,
        sales: (r.sales as number | null) ?? null,
        visit_source_id: (r.visit_source_id as number | null) ?? null,
        shop_id: (r.shop_id as number | null) ?? null,
        booking_link_id: (r.booking_link_id as number | null) ?? null,
      })
    );

    // start_at 昇順なので最初に出会ったものが最古
    for (const r of histRows) {
      if (!firstApptByCustomer.has(r.customer_id)) {
        firstApptByCustomer.set(r.customer_id, {
          id: r.id,
          status: r.status,
          start_at: r.start_at,
          visit_source_id: r.visit_source_id,
          shop_id: r.shop_id,
          booking_link_id: r.booking_link_id,
        });
        if (r.visit_source_id != null) {
          customerSourceMap.set(r.customer_id, r.visit_source_id);
        }
      }
      if (r.status === 2) {
        const set = firstThreeCompleted.get(r.customer_id) ?? new Set<number>();
        if (set.size < 3) {
          set.add(r.id);
          firstThreeCompleted.set(r.customer_id, set);
        }
      }
    }

    const [plansRes, joinAptsRes, customersRes] = await Promise.all([
      supabase
        .from("customer_plans")
        .select("customer_id")
        .in("customer_id", customerIds)
        .is("deleted_at", null),
      supabase
        .from("appointments")
        .select("customer_id")
        .eq(scopeCol, scopeVal)
        .eq("is_member_join", true)
        .in("customer_id", customerIds)
        .is("deleted_at", null),
      supabase
        .from("customers")
        .select("id, first_visit_source_id")
        .in("id", customerIds),
    ]);
    for (const r of (plansRes.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(r.customer_id);
    }
    for (const r of (joinAptsRes.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(r.customer_id);
    }
    // customers.first_visit_source_id を初回媒体の最優先ソースにする
    for (const r of (customersRes.data ?? []) as Array<{
      id: number;
      first_visit_source_id: number | null;
    }>) {
      if (r.first_visit_source_id != null) {
        customerSourceMap.set(r.id, r.first_visit_source_id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. 期間内 ad_spend (creative 単位 + 媒体単位の両方)
  // ---------------------------------------------------------------------------
  let adSpendQ = supabase
    .from("ad_spend")
    .select("shop_id, visit_source_id, booking_link_id, year_month, amount")
    .gte("year_month", startMonth)
    .lte("year_month", endMonth)
    .is("deleted_at", null);
  adSpendQ =
    shopId != null
      ? adSpendQ.eq("shop_id", shopId)
      : adSpendQ.eq("brand_id", brandId);
  let adSpendRes = await adSpendQ;
  if (
    adSpendRes.error &&
    adSpendRes.error.message?.includes("booking_link_id") &&
    (adSpendRes.error.message.includes("column") ||
      adSpendRes.error.message.includes("schema cache"))
  ) {
    // 00050 未適用環境 → booking_link_id 抜きで取得し、全て媒体単位扱い
    let retryQ = supabase
      .from("ad_spend")
      .select("shop_id, visit_source_id, year_month, amount")
      .gte("year_month", startMonth)
      .lte("year_month", endMonth)
      .is("deleted_at", null);
    retryQ =
      shopId != null
        ? retryQ.eq("shop_id", shopId)
        : retryQ.eq("brand_id", brandId);
    adSpendRes = await retryQ;
  }
  type AdSpendRow = {
    shop_id: number | null;
    visit_source_id: number;
    booking_link_id: number | null;
    year_month: string;
    amount: number;
  };
  const adSpendRows = ((adSpendRes.data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      shop_id: (r.shop_id as number | null) ?? null,
      visit_source_id: r.visit_source_id as number,
      booking_link_id: (r.booking_link_id as number | null) ?? null,
      year_month: r.year_month as string,
      amount: (r.amount as number | null) ?? 0,
    })
  ) as AdSpendRow[];

  // ---------------------------------------------------------------------------
  // 5. lookup マップ (shop / symptom / visit_source 名)
  // ---------------------------------------------------------------------------
  const shopMap = new Map<number, string>(
    (shopsRes.data ?? []).map((s) => [s.id as number, s.name as string])
  );
  const symptomMap = new Map<string, string>(
    ((symptomsRes.data ?? []) as Array<{ code: string; name: string }>).map(
      (s) => [s.code, s.name]
    )
  );
  // 参照される visit_source_id を全て集めて 1 クエリで名前解決
  const sourceIdSet = new Set<number>();
  for (const l of links) if (l.visit_source_id != null) sourceIdSet.add(l.visit_source_id);
  for (const f of firstApptByCustomer.values())
    if (f.visit_source_id != null) sourceIdSet.add(f.visit_source_id);
  for (const v of customerSourceMap.values()) if (v != null) sourceIdSet.add(v);
  for (const r of adSpendRows) sourceIdSet.add(r.visit_source_id);
  const visitSourceMap = new Map<number, string>();
  if (sourceIdSet.size > 0) {
    const { data: vs } = await supabase
      .from("visit_sources")
      .select("id, name")
      .in("id", Array.from(sourceIdSet))
      .is("deleted_at", null);
    for (const s of (vs ?? []) as Array<{ id: number; name: string }>) {
      visitSourceMap.set(s.id, s.name);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. バケット生成 (creative: 店舗×媒体×症状×オファー / 未割当: 店舗×媒体)
  // ---------------------------------------------------------------------------
  type Bucket = BucketMetrics & {
    shopId: number | null;
    visitSourceId: number | null;
    symptom: string | null;
    offerPrice: number | null;
    unassigned: boolean;
    bookingLinkIds: Set<number>;
    bookingLinkTitles: Set<string>;
  };
  const bucketMap = new Map<string, Bucket>();

  type Coords = {
    key: string;
    shop: number | null;
    source: number | null;
    symptom: string | null;
    offer: number | null;
    unassigned: boolean;
    linkId: number | null;
  };

  function coordsForCustomer(cid: number): Coords | null {
    const first = firstApptByCustomer.get(cid);
    if (!first) return null;
    const linkId = first.booking_link_id;
    if (linkId != null && linkById.has(linkId)) {
      const link = linkById.get(linkId)!;
      const shop = link.shop_id ?? first.shop_id;
      return {
        key: `C::${shop ?? "_"}::${link.visit_source_id ?? "_"}::${link.symptom ?? "_"}::${link.offer_price ?? "_"}`,
        shop,
        source: link.visit_source_id,
        symptom: link.symptom,
        offer: link.offer_price,
        unassigned: false,
        linkId,
      };
    }
    // リンクに紐付かない → 未割当 (症状/オファーフィルタ時は除外)
    if (filtered) return null;
    const source = first.visit_source_id ?? customerSourceMap.get(cid) ?? null;
    const shop = first.shop_id ?? shopId ?? null;
    return {
      key: `U::${shop ?? "_"}::${source ?? "_"}`,
      shop,
      source,
      symptom: null,
      offer: null,
      unassigned: true,
      linkId: null,
    };
  }

  function getBucketByCoords(c: Coords): Bucket {
    let b = bucketMap.get(c.key);
    if (!b) {
      b = {
        ...emptyBucket(),
        shopId: c.shop,
        visitSourceId: c.source,
        symptom: c.symptom,
        offerPrice: c.offer,
        unassigned: c.unassigned,
        bookingLinkIds: new Set(),
        bookingLinkTitles: new Set(),
      };
      bucketMap.set(c.key, b);
    }
    return b;
  }

  // 顧客 → バケット座標 (新規/売上の両方で使うので 1 回だけ計算)
  const coordsCache = new Map<number, Coords | null>();
  function coordsOf(cid: number): Coords | null {
    if (coordsCache.has(cid)) return coordsCache.get(cid)!;
    const c = coordsForCustomer(cid);
    coordsCache.set(cid, c);
    return c;
  }

  // 6a. 新規 attribution: 人生最古予約が当期間にある顧客を 1 件として計上
  for (const [cid, first] of firstApptByCustomer) {
    if (first.start_at < startTs || first.start_at >= endTsExclusive) continue;
    const c = coordsOf(cid);
    if (!c) continue;
    const b = getBucketByCoords(c);
    if (c.linkId != null) {
      const link = linkById.get(c.linkId);
      if (link) {
        b.bookingLinkIds.add(link.id);
        b.bookingLinkTitles.add(link.title);
      }
    }
    b.reservationCount += 1;
    const status = first.status;
    const isCancel = status === 3 || status === 4 || status === 99;
    if (status === 2) {
      b.visitCount += 1;
      if (customerEverJoined.has(cid)) b.joinCount += 1;
    } else if (isCancel) {
      b.cancelCount += 1;
    }
    // status 0/1 (待機/施術中) は reservationCount にのみ含める (= 残り新規)
  }

  // 6b. 売上: 顧客の 1〜3 回目 status=2 予約のうち当期間分を、その顧客の
  //     バケットに加算 (媒体別内訳の売上集計と完全に一致させる)
  for (const r of histRows) {
    if (r.status !== 2) continue;
    if (r.start_at < startTs || r.start_at >= endTsExclusive) continue;
    const set = firstThreeCompleted.get(r.customer_id);
    if (!set || !set.has(r.id)) continue;
    const c = coordsOf(r.customer_id);
    if (!c) continue;
    if (r.sales) getBucketByCoords(c).sales += r.sales;
  }

  // 6c. 広告費: creative 単位は該当リンクのバケットへ、媒体単位は未割当へ
  for (const r of adSpendRows) {
    if (r.booking_link_id != null && linkIdSet.has(r.booking_link_id)) {
      const link = linkById.get(r.booking_link_id);
      if (!link) continue;
      const shop = link.shop_id ?? r.shop_id;
      const c: Coords = {
        key: `C::${shop ?? "_"}::${link.visit_source_id ?? "_"}::${link.symptom ?? "_"}::${link.offer_price ?? "_"}`,
        shop,
        source: link.visit_source_id,
        symptom: link.symptom,
        offer: link.offer_price,
        unassigned: false,
        linkId: link.id,
      };
      const b = getBucketByCoords(c);
      b.bookingLinkIds.add(link.id);
      b.bookingLinkTitles.add(link.title);
      b.adSpend += r.amount;
    } else if (!filtered) {
      // 媒体単位 (booking_link_id NULL) or 対象外リンク → 未割当
      const shop = r.shop_id ?? shopId ?? null;
      const c: Coords = {
        key: `U::${shop ?? "_"}::${r.visit_source_id ?? "_"}`,
        shop,
        source: r.visit_source_id,
        symptom: null,
        offer: null,
        unassigned: true,
        linkId: null,
      };
      getBucketByCoords(c).adSpend += r.amount;
    }
  }

  // ---------------------------------------------------------------------------
  // 7. 結果を配列化 (creative を上、未割当を下にして売上 desc)
  // ---------------------------------------------------------------------------
  const rows: CreativeBucket[] = Array.from(bucketMap.entries())
    .map(([key, b]) => {
      const finalized = finalize(b);
      return {
        key,
        shopId: b.shopId,
        shopName: b.shopId != null ? shopMap.get(b.shopId) ?? null : null,
        visitSourceId: b.visitSourceId,
        visitSourceName:
          b.visitSourceId != null
            ? visitSourceMap.get(b.visitSourceId) ?? null
            : null,
        symptom: b.symptom,
        symptomName: b.symptom ? symptomMap.get(b.symptom) ?? b.symptom : null,
        offerPrice: b.offerPrice,
        unassigned: b.unassigned,
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
    // 全部 0 のバケット (例: 名前解決用に作られかけたもの) は除外
    .filter(
      (r) =>
        r.reservationCount > 0 ||
        r.visitCount > 0 ||
        r.sales > 0 ||
        r.adSpend > 0
    )
    // creative を上に、その中で売上 desc。未割当は最後尾。
    .sort((a, c) => {
      if (a.unassigned !== c.unassigned) return a.unassigned ? 1 : -1;
      return c.sales - a.sales || c.adSpend - a.adSpend;
    });

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
