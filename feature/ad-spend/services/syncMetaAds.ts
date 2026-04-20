"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Meta Marketing API から広告レポートを取得して ad_spend に upsert する。
 *
 * - shops.meta_ad_account_id / meta_access_token を使う
 * - visit_sources.platform_type='meta' の行に対して同期
 * - 取得期間: 当月 1 日〜今日 (Asia/Tokyo)
 * - 月単位に集計して 1 行 = (shop, visit_source, year_month) を upsert
 *
 * 詳細仕様は docs/ad-api-integration.md を参照。
 */

export interface SyncResult {
  ok: boolean;
  fetchedRows: number;
  error?: string;
}

interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend?: string;        // "1234.56"
  impressions?: string;  // "12345"
  clicks?: string;       // "123"
  ctr?: string;          // "1.23"  (= 1.23%)
  cpm?: string;          // "456.78"
  actions?: Array<{ action_type: string; value: string }>;
}

interface MetaInsightsResponse {
  data?: MetaInsight[];
  error?: { message: string; code?: number };
}

const META_API_VERSION = "v19.0";
// CVR 計算で参照する Meta の action_type。
// 通常は 'lead' 'purchase' 'complete_registration' あたりが KPI。
// 必要に応じて env で上書き可能 (META_CONVERSION_ACTION_TYPES=offsite_conversion.fb_pixel_lead,...)
function conversionActionTypes(): string[] {
  const fromEnv = process.env.META_CONVERSION_ACTION_TYPES;
  if (fromEnv) return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  return [
    "lead",
    "purchase",
    "complete_registration",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion.fb_pixel_purchase",
  ];
}

function tokyoDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function startOfMonthTokyo(d: Date = new Date()): string {
  const today = tokyoDate(d);
  return today.slice(0, 7) + "-01";
}

function sumActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[]
): number {
  if (!actions) return 0;
  let sum = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) sum += Number(a.value) || 0;
  }
  return sum;
}

async function fetchMetaInsights(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string,
  campaignId: string | null
): Promise<MetaInsight[]> {
  // ad_account_id は "act_..." prefix が必要
  const accountIdNormalized = adAccountId.startsWith("act_")
    ? adAccountId
    : `act_${adAccountId}`;
  const baseUrl = campaignId
    ? `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/insights`
    : `https://graph.facebook.com/${META_API_VERSION}/${accountIdNormalized}/insights`;

  const params = new URLSearchParams({
    fields: "spend,impressions,clicks,ctr,cpm,actions",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1", // 日次
    access_token: accessToken,
  });

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const json = (await res.json()) as MetaInsightsResponse;
  if (json.error) {
    throw new Error(`Meta API error: ${json.error.message}`);
  }
  return json.data ?? [];
}

export async function syncMetaAds(
  shopId: number,
  triggeredBy: "cron" | "manual" = "manual"
): Promise<SyncResult> {
  const supabase = await createClient();
  const startedAt = new Date().toISOString();

  // 1. 認証情報を取得
  const { data: shop } = await supabase
    .from("shops")
    .select("brand_id, meta_ad_account_id, meta_access_token")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop?.meta_ad_account_id || !shop?.meta_access_token) {
    const errMsg = "Meta API トークンが店舗設定に未登録です";
    await logSync(shopId, "failed", 0, errMsg, triggeredBy, startedAt);
    return { ok: false, fetchedRows: 0, error: errMsg };
  }

  // 2. Meta 紐付けの visit_sources を列挙
  const { data: sources } = await supabase
    .from("visit_sources")
    .select("id, name, platform_account_id")
    .eq("shop_id", shopId)
    .eq("platform_type", "meta")
    .is("deleted_at", null);
  const metaSources = sources ?? [];
  if (metaSources.length === 0) {
    const errMsg = "platform_type='meta' の visit_source がありません";
    await logSync(shopId, "failed", 0, errMsg, triggeredBy, startedAt);
    return { ok: false, fetchedRows: 0, error: errMsg };
  }

  // 3. 期間: 当月 1 日〜今日
  const since = startOfMonthTokyo();
  const until = tokyoDate();
  const yearMonth = since.slice(0, 7);

  // 4. visit_source ごとに API を叩いて集計
  let totalRows = 0;
  try {
    for (const src of metaSources) {
      const rows = await fetchMetaInsights(
        shop.meta_ad_account_id,
        shop.meta_access_token,
        since,
        until,
        src.platform_account_id
      );
      totalRows += rows.length;
      // 月単位に集計 (sum / 平均)
      const agg = aggregateRows(rows);
      // upsert
      await upsertAdSpend({
        brandId: shop.brand_id as number,
        shopId,
        visitSourceId: src.id as number,
        yearMonth,
        amount: Math.round(agg.spend),
        impressions: agg.impressions,
        clicks: agg.clicks,
        conversions: agg.conversions,
        ctr: agg.ctr,
        cvr: agg.cvr,
        cpm: agg.cpm,
        source: "meta",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Meta sync 失敗";
    await logSync(shopId, "failed", totalRows, msg, triggeredBy, startedAt);
    return { ok: false, fetchedRows: totalRows, error: msg };
  }

  await logSync(shopId, "success", totalRows, null, triggeredBy, startedAt);
  return { ok: true, fetchedRows: totalRows };
}

interface AggregatedRow {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
  cpm: number;
}

function aggregateRows(rows: MetaInsight[]): AggregatedRow {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  for (const r of rows) {
    spend += Number(r.spend ?? 0) || 0;
    impressions += Number(r.impressions ?? 0) || 0;
    clicks += Number(r.clicks ?? 0) || 0;
    conversions += sumActions(r.actions, conversionActionTypes());
  }
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  return { spend, impressions, clicks, conversions, ctr, cvr, cpm };
}

interface UpsertInput {
  brandId: number;
  shopId: number;
  visitSourceId: number;
  yearMonth: string;
  amount: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
  cpm: number;
  source: "meta" | "tiktok";
}

export async function upsertAdSpend(input: UpsertInput): Promise<void> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ad_spend")
    .select("id")
    .eq("shop_id", input.shopId)
    .eq("visit_source_id", input.visitSourceId)
    .eq("year_month", input.yearMonth)
    .is("deleted_at", null)
    .maybeSingle();
  const payload = {
    brand_id: input.brandId,
    shop_id: input.shopId,
    visit_source_id: input.visitSourceId,
    year_month: input.yearMonth,
    amount: input.amount,
    impressions: input.impressions,
    clicks: input.clicks,
    conversions: input.conversions,
    ctr: input.ctr,
    cvr: input.cvr,
    cpm: input.cpm,
    source: input.source,
    synced_at: new Date().toISOString(),
  };
  if (existing?.id) {
    await supabase.from("ad_spend").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("ad_spend").insert(payload);
  }
}

async function logSync(
  shopId: number,
  status: "success" | "failed",
  fetchedRows: number,
  errorMessage: string | null,
  triggeredBy: "cron" | "manual",
  startedAt: string
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("ad_sync_logs").insert({
    shop_id: shopId,
    platform: "meta",
    status,
    fetched_rows: fetchedRows,
    error_message: errorMessage,
    triggered_by: triggeredBy,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
}
