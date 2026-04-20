"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { upsertAdSpend, type SyncResult } from "./syncMetaAds";

/**
 * TikTok Marketing API から広告レポートを取得して ad_spend に upsert する。
 *
 * - shops.tiktok_advertiser_id / tiktok_access_token を使う
 * - visit_sources.platform_type='tiktok' の行に対して同期
 * - 取得期間: 当月 1 日〜今日 (Asia/Tokyo)
 *
 * 詳細仕様は docs/ad-api-integration.md を参照。
 */

interface TikTokMetric {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;          // パーセント値 (例 "1.23")
  cpm?: string;
  conversion?: string;
  conversion_rate?: string;
}

interface TikTokDimension {
  stat_time_day?: string; // 'YYYY-MM-DD'
  ad_id?: string;
  campaign_id?: string;
  advertiser_id?: string;
}

interface TikTokListItem {
  metrics: TikTokMetric;
  dimensions: TikTokDimension;
}

interface TikTokReportResponse {
  code?: number;
  message?: string;
  data?: { list?: TikTokListItem[] };
}

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

function tokyoDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function startOfMonthTokyo(): string {
  const t = tokyoDate();
  return t.slice(0, 7) + "-01";
}

async function fetchTikTokReport(
  advertiserId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  campaignId: string | null
): Promise<TikTokListItem[]> {
  const filtering: Array<{ field_name: string; filter_type: string; filter_value: string }> = [];
  if (campaignId) {
    filtering.push({
      field_name: "campaign_ids",
      filter_type: "IN",
      filter_value: JSON.stringify([campaignId]),
    });
  }

  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: JSON.stringify(["stat_time_day"]),
    metrics: JSON.stringify([
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "cpm",
      "conversion",
      "conversion_rate",
    ]),
    start_date: startDate,
    end_date: endDate,
    page: "1",
    page_size: "200",
  });
  if (filtering.length > 0) {
    params.set("filtering", JSON.stringify(filtering));
  }

  const url = `${TIKTOK_API_BASE}/report/integrated/get/?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Access-Token": accessToken,
    },
    cache: "no-store",
  });
  const json = (await res.json()) as TikTokReportResponse;
  if (json.code && json.code !== 0) {
    throw new Error(`TikTok API error (${json.code}): ${json.message ?? "unknown"}`);
  }
  return json.data?.list ?? [];
}

export async function syncTikTokAds(
  shopId: number,
  triggeredBy: "cron" | "manual" = "manual"
): Promise<SyncResult> {
  const supabase = await createClient();
  const startedAt = new Date().toISOString();

  const { data: shop } = await supabase
    .from("shops")
    .select("brand_id, tiktok_advertiser_id, tiktok_access_token")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop?.tiktok_advertiser_id || !shop?.tiktok_access_token) {
    const errMsg = "TikTok API トークンが店舗設定に未登録です";
    await logSync(shopId, "failed", 0, errMsg, triggeredBy, startedAt);
    return { ok: false, fetchedRows: 0, error: errMsg };
  }

  const { data: sources } = await supabase
    .from("visit_sources")
    .select("id, name, platform_account_id")
    .eq("shop_id", shopId)
    .eq("platform_type", "tiktok")
    .is("deleted_at", null);
  const tiktokSources = sources ?? [];
  if (tiktokSources.length === 0) {
    const errMsg = "platform_type='tiktok' の visit_source がありません";
    await logSync(shopId, "failed", 0, errMsg, triggeredBy, startedAt);
    return { ok: false, fetchedRows: 0, error: errMsg };
  }

  const since = startOfMonthTokyo();
  const until = tokyoDate();
  const yearMonth = since.slice(0, 7);

  let totalRows = 0;
  try {
    for (const src of tiktokSources) {
      const items = await fetchTikTokReport(
        shop.tiktok_advertiser_id,
        shop.tiktok_access_token,
        since,
        until,
        src.platform_account_id
      );
      totalRows += items.length;

      let spend = 0;
      let impressions = 0;
      let clicks = 0;
      let conversions = 0;
      for (const it of items) {
        spend += Number(it.metrics?.spend ?? 0) || 0;
        impressions += Number(it.metrics?.impressions ?? 0) || 0;
        clicks += Number(it.metrics?.clicks ?? 0) || 0;
        conversions += Number(it.metrics?.conversion ?? 0) || 0;
      }
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

      await upsertAdSpend({
        brandId: shop.brand_id as number,
        shopId,
        visitSourceId: src.id as number,
        yearMonth,
        amount: Math.round(spend),
        impressions,
        clicks,
        conversions,
        ctr,
        cvr,
        cpm,
        source: "tiktok",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "TikTok sync 失敗";
    await logSync(shopId, "failed", totalRows, msg, triggeredBy, startedAt);
    return { ok: false, fetchedRows: totalRows, error: msg };
  }

  await logSync(shopId, "success", totalRows, null, triggeredBy, startedAt);
  return { ok: true, fetchedRows: totalRows };
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
    platform: "tiktok",
    status,
    fetched_rows: fetchedRows,
    error_message: errorMessage,
    triggered_by: triggeredBy,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
}
