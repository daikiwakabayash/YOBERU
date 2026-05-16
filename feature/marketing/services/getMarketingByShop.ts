"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Cross-shop marketing aggregation for the 店舗別 tab.
 *
 * Fetches appointments + ad_spend for ALL shops under the brand in one
 * round trip each, then bucketizes by shop_id in-memory. Returns an array
 * sorted by sales desc.
 *
 * Scale note: ~300 appts/shop/month × N shops × M months. With N×M up to
 * a few thousand this is fine. If the brand grows beyond ~50 shops or
 * 12-month windows we should push aggregation into SQL.
 */

export interface ShopTotals {
  shopId: number;
  shopName: string;
  reservationCount: number;
  visitCount: number;
  joinCount: number;
  cancelCount: number;
  sales: number;
  adSpend: number;
  joinRate: number;
  cancelRate: number;
  cpa: number;
  roas: number;
  avgPrice: number;
}

function emptyShopTotals(shopId: number, shopName: string): ShopTotals {
  return {
    shopId,
    shopName,
    reservationCount: 0,
    visitCount: 0,
    joinCount: 0,
    cancelCount: 0,
    sales: 0,
    adSpend: 0,
    joinRate: 0,
    cancelRate: 0,
    cpa: 0,
    roas: 0,
    avgPrice: 0,
  };
}

function finalizeShop(t: ShopTotals): ShopTotals {
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

export async function getMarketingByShop(params: {
  brandId: number;
  startMonth: string;
  endMonth: string;
  visitSourceId?: number | null;
  staffId?: number | null;
}): Promise<{
  shops: ShopTotals[];
  grandTotal: Omit<ShopTotals, "shopId" | "shopName">;
}> {
  const { brandId, startMonth, endMonth, visitSourceId, staffId } = params;
  const supabase = await createClient();

  const startTs = `${startMonth}-01T00:00:00+09:00`;
  const [ey, em] = endMonth.split("-").map(Number);
  const nextY = em === 12 ? ey + 1 : ey;
  const nextM = em === 12 ? 1 : em + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  // 1. All shops under the brand (shop_id → name)
  const { data: shopsRes } = await supabase
    .from("shops")
    .select("id, name")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  const shops = (shopsRes ?? []) as Array<{ id: number; name: string }>;

  // Pre-seed buckets for every shop so zero-data shops still show up.
  const byShop = new Map<number, ShopTotals>();
  for (const s of shops) {
    byShop.set(s.id, emptyShopTotals(s.id, s.name));
  }

  // 2. 期間内の status=2 (完了) 予約をブランド全体で取得。新規 attribution
  //    は「顧客の人生最古 status=2 予約」一致 (visit_count スタンプには
  //    依存しない)。入会判定は顧客レベルでライフタイム判定する。
  //    getMarketingData.ts と同じ方針。
  let apptQuery = supabase
    .from("appointments")
    .select("id, customer_id, shop_id, status, sales, visit_source_id, start_at")
    .eq("brand_id", brandId)
    .eq("status", 2)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  if (visitSourceId) apptQuery = apptQuery.eq("visit_source_id", visitSourceId);
  if (staffId) apptQuery = apptQuery.eq("staff_id", staffId);

  // 3. All ad_spend across the brand in range (one query)
  const { data: adSpendRes } = await supabase
    .from("ad_spend")
    .select("shop_id, visit_source_id, amount")
    .eq("brand_id", brandId)
    .gte("year_month", startMonth)
    .lte("year_month", endMonth)
    .is("deleted_at", null);

  const { data: apptRes } = await apptQuery;
  const appointments = (apptRes ?? []) as Array<{
    id: number;
    customer_id: number | null;
    shop_id: number;
    status: number;
    sales: number | null;
    visit_source_id: number | null;
    start_at: string;
  }>;
  const adSpend = (adSpendRes ?? []) as Array<{
    shop_id: number;
    visit_source_id: number;
    amount: number;
  }>;

  // ライフタイム attribution: 期間内予約に出てくる顧客の「人生最古
  // status=2 予約 id」と「ライフタイム入会フラグ」を求める。
  const customerIdsInRange = Array.from(
    new Set(
      appointments
        .map((a) => a.customer_id)
        .filter((id): id is number => id != null)
    )
  );
  const firstCompletedApptIdByCustomer = new Map<number, number>();
  const customerEverJoined = new Set<number>();
  if (customerIdsInRange.length > 0) {
    const [completedHistRes, plansRes, joinFlagApptsRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, customer_id, start_at")
        .eq("brand_id", brandId)
        .eq("status", 2)
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
      supabase
        .from("customer_plans")
        .select("customer_id")
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null),
      supabase
        .from("appointments")
        .select("customer_id")
        .eq("brand_id", brandId)
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
    for (const p of (plansRes.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(p.customer_id);
    }
    for (const r of (joinFlagApptsRes.data ?? []) as Array<{
      customer_id: number;
    }>) {
      customerEverJoined.add(r.customer_id);
    }
  }

  for (const a of appointments) {
    // 真の新規 attribution: 顧客の最古完了予約 id と一致するもののみ。
    if (a.customer_id == null) continue;
    if (firstCompletedApptIdByCustomer.get(a.customer_id) !== a.id) continue;

    const bucket =
      byShop.get(a.shop_id) ?? emptyShopTotals(a.shop_id, "(不明)");
    if (!byShop.has(a.shop_id)) byShop.set(a.shop_id, bucket);

    // 新規顧客は status=2 確定なので 予約 = 実来院 = 1 で揃う。
    bucket.reservationCount += 1;
    bucket.visitCount += 1;
    if (a.sales) bucket.sales += a.sales;
    if (customerEverJoined.has(a.customer_id)) {
      bucket.joinCount += 1;
    }
  }

  for (const r of adSpend) {
    // Honour visitSource filter for ad spend too so ROAS is consistent
    if (visitSourceId && r.visit_source_id !== visitSourceId) continue;
    const bucket =
      byShop.get(r.shop_id) ?? emptyShopTotals(r.shop_id, "(不明)");
    if (!byShop.has(r.shop_id)) byShop.set(r.shop_id, bucket);
    bucket.adSpend += r.amount;
  }

  const finalized = Array.from(byShop.values())
    .map(finalizeShop)
    .sort((a, b) => b.sales - a.sales);

  // Grand totals (sum everything)
  const grand = finalized.reduce(
    (g, s) => {
      g.reservationCount += s.reservationCount;
      g.visitCount += s.visitCount;
      g.joinCount += s.joinCount;
      g.cancelCount += s.cancelCount;
      g.sales += s.sales;
      g.adSpend += s.adSpend;
      return g;
    },
    {
      reservationCount: 0,
      visitCount: 0,
      joinCount: 0,
      cancelCount: 0,
      sales: 0,
      adSpend: 0,
      joinRate: 0,
      cancelRate: 0,
      cpa: 0,
      roas: 0,
      avgPrice: 0,
    }
  );
  grand.joinRate = grand.visitCount > 0 ? grand.joinCount / grand.visitCount : 0;
  grand.cancelRate =
    grand.reservationCount > 0
      ? grand.cancelCount / grand.reservationCount
      : 0;
  grand.cpa = grand.visitCount > 0 ? grand.adSpend / grand.visitCount : 0;
  grand.roas = grand.adSpend > 0 ? grand.sales / grand.adSpend : 0;
  grand.avgPrice = grand.visitCount > 0 ? grand.sales / grand.visitCount : 0;

  return { shops: finalized, grandTotal: grand };
}
