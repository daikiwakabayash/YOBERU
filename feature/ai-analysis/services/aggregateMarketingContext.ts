import "server-only";

import { createClient } from "@/helper/lib/supabase/server";
import { getCatchmentCustomers } from "@/feature/catchment/services/getCatchmentCustomers";
import { getMetaAdsSummary } from "@/feature/meta-ads/services/getMetaAdsSummary";

/**
 * AI 分析用の入力データを 1 つにまとめるサービス。
 *
 * Claude にそのまま JSON で渡せる形に整える。
 *   - 媒体 × 半径 (1/3/5/10 km) の顧客分布
 *   - 媒体 × 年齢層の分布
 *   - 月次 CPA / ROAS / 入会率 / キャンセル率 (媒体別)
 *   - Meta 広告の日次 CTR / CPC / 消化金額
 *
 * Claude は Hi-context モデルなのでデータをそのまま流し込めば良い。
 * 個人情報は乗せない (顧客名 / 住所 / 電話 などは弾く)。lat/lng も
 * 集計済みの距離分布だけ渡す。
 */

export interface RadiusBucket {
  radiusKm: number; // 1 / 3 / 5 / 10
  customerCount: number;
  byAgeGroup: Record<string, number>; // "<19" / "20-29" / ...
}

export interface SourceProfile {
  visitSourceId: number;
  name: string;
  totalCustomers: number;
  byRadius: RadiusBucket[];
  /** ageGroup -> count (この媒体の客全員ベース) */
  byAge: Record<string, number>;
}

export interface MetaInsightSummary {
  available: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // 0..1
  cpm: number;
  cpc: number;
  byCampaign: Array<{
    name: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
}

export interface MarketingContextForAi {
  shop: {
    id: number;
    name: string | null;
    lat: number | null;
    lng: number | null;
  };
  period: {
    startMonth: string;
    endMonth: string;
  };
  /** 媒体ごとの来店履歴に基づく分布 */
  sourceProfiles: SourceProfile[];
  /** 媒体別の予約 / 来院 / 入会 / キャンセル / 売上 */
  sourceKpi: Array<{
    visitSourceId: number;
    name: string;
    reservationCount: number;
    visitCount: number;
    joinCount: number;
    cancelCount: number;
    sales: number;
    adSpend: number;
    cpa: number | null;
    roas: number | null;
  }>;
  /** Meta 広告 (連携してれば) */
  meta: MetaInsightSummary;
}

const AGE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "<19", min: 0, max: 19 },
  { label: "20-29", min: 20, max: 29 },
  { label: "30-39", min: 30, max: 39 },
  { label: "40-49", min: 40, max: 49 },
  { label: "50-59", min: 50, max: 59 },
  { label: "60+", min: 60, max: 999 },
];
const RADII_KM = [1, 3, 5, 10] as const;

function ageBucket(age: number | null): string {
  if (age == null) return "unknown";
  const b = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max);
  return b?.label ?? "unknown";
}

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function aggregateMarketingContext(params: {
  shopId: number;
  startMonth: string; // YYYY-MM
  endMonth: string;
}): Promise<MarketingContextForAi> {
  const { shopId, startMonth, endMonth } = params;
  const supabase = await createClient();

  // 商圏: 全顧客 (期間で絞らない、AI には全期間の客層を見せる)
  const catchment = await getCatchmentCustomers({ shopId });

  // 媒体マスター
  const { data: sources } = await supabase
    .from("visit_sources")
    .select("id, name")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("sort_number", { ascending: true, nullsFirst: false });
  const sourceList = (sources ?? []).map((s) => ({
    id: s.id as number,
    name: s.name as string,
  }));

  // 媒体プロファイル: 顧客を媒体・半径・年齢で集計
  const sourceProfiles: SourceProfile[] = sourceList.map((s) => ({
    visitSourceId: s.id,
    name: s.name,
    totalCustomers: 0,
    byRadius: RADII_KM.map((r) => ({
      radiusKm: r,
      customerCount: 0,
      byAgeGroup: Object.fromEntries(
        AGE_BUCKETS.map((b) => [b.label, 0])
      ) as Record<string, number>,
    })),
    byAge: Object.fromEntries(AGE_BUCKETS.map((b) => [b.label, 0])) as Record<
      string,
      number
    >,
  }));
  const sourceProfileMap = new Map(
    sourceProfiles.map((p) => [p.visitSourceId, p])
  );

  for (const p of catchment.points) {
    const profile = p.visitSourceId
      ? sourceProfileMap.get(p.visitSourceId)
      : undefined;
    if (!profile) continue;
    profile.totalCustomers += 1;
    const ag = ageBucket(p.age);
    if (ag !== "unknown" && ag in profile.byAge) {
      profile.byAge[ag] += 1;
    }
    if (catchment.shop) {
      const dist = distanceKm(catchment.shop, p);
      for (const bucket of profile.byRadius) {
        if (dist <= bucket.radiusKm) {
          bucket.customerCount += 1;
          if (ag !== "unknown" && ag in bucket.byAgeGroup) {
            bucket.byAgeGroup[ag] += 1;
          }
        }
      }
    }
  }

  // 媒体別 KPI: appointments + ad_spend を期間で集計
  const startTs = `${startMonth}-01T00:00:00+09:00`;
  const [endY, endM] = endMonth.split("-").map(Number);
  const nextY = endM === 12 ? endY + 1 : endY;
  const nextM = endM === 12 ? 1 : endM + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  const [apptRes, adSpendRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("status, sales, visit_source_id, is_member_join, visit_count")
      .eq("shop_id", shopId)
      .gte("start_at", startTs)
      .lt("start_at", endTsExclusive)
      .is("deleted_at", null),
    supabase
      .from("ad_spend")
      .select("visit_source_id, amount")
      .eq("shop_id", shopId)
      .gte("year_month", startMonth)
      .lte("year_month", endMonth)
      .is("deleted_at", null),
  ]);

  type ApptRow = {
    status: number;
    sales: number | null;
    visit_source_id: number | null;
    is_member_join: boolean | null;
    visit_count: number | null;
  };
  const apptRows = (apptRes.data ?? []) as ApptRow[];
  const sourceKpiMap = new Map<
    number,
    {
      visitSourceId: number;
      name: string;
      reservationCount: number;
      visitCount: number;
      joinCount: number;
      cancelCount: number;
      sales: number;
      adSpend: number;
    }
  >();
  for (const s of sourceList) {
    sourceKpiMap.set(s.id, {
      visitSourceId: s.id,
      name: s.name,
      reservationCount: 0,
      visitCount: 0,
      joinCount: 0,
      cancelCount: 0,
      sales: 0,
      adSpend: 0,
    });
  }
  for (const a of apptRows) {
    if ((a.visit_count ?? 0) !== 1) continue; // 新規来院だけ集計
    const sid = a.visit_source_id ?? null;
    if (!sid) continue;
    const k = sourceKpiMap.get(sid);
    if (!k) continue;
    k.reservationCount += 1;
    if (a.status === 1 || a.status === 2) k.visitCount += 1;
    if (a.status === 3 || a.status === 4 || a.status === 99) k.cancelCount += 1;
    if (a.is_member_join) k.joinCount += 1;
    if (a.status === 2) k.sales += a.sales ?? 0;
  }
  for (const r of (adSpendRes.data ?? []) as Array<{
    visit_source_id: number;
    amount: number;
  }>) {
    const k = sourceKpiMap.get(r.visit_source_id);
    if (k) k.adSpend += r.amount ?? 0;
  }

  const sourceKpi = Array.from(sourceKpiMap.values()).map((k) => ({
    ...k,
    cpa: k.visitCount > 0 ? k.adSpend / k.visitCount : null,
    roas: k.adSpend > 0 ? k.sales / k.adSpend : null,
  }));

  // Meta 広告
  const startDate = `${startMonth}-01`;
  const endLastDay = new Date(nextY, nextM - 1, 0).getDate();
  const endDate = `${endMonth}-${String(endLastDay).padStart(2, "0")}`;
  const metaSummary = await getMetaAdsSummary({
    shopId,
    startDate,
    endDate,
  });

  return {
    shop: {
      id: shopId,
      name: catchment.shop?.name ?? null,
      lat: catchment.shop?.lat ?? null,
      lng: catchment.shop?.lng ?? null,
    },
    period: { startMonth, endMonth },
    sourceProfiles,
    sourceKpi,
    meta: {
      available: metaSummary.hasAccount,
      spend: metaSummary.totals.spend,
      impressions: metaSummary.totals.impressions,
      clicks: metaSummary.totals.clicks,
      ctr: metaSummary.totals.ctr,
      cpm: metaSummary.totals.cpm,
      cpc: metaSummary.totals.cpc,
      byCampaign: metaSummary.byCampaign.map((c) => ({
        name: c.name,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: c.ctr,
      })),
    },
  };
}
