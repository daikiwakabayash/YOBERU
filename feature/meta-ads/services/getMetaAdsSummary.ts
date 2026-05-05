import "server-only";

import { createClient } from "@/helper/lib/supabase/server";

export interface MetaAdsSummary {
  hasAccount: boolean;
  accountId: number | null;
  adAccountId: string | null;
  displayName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
    conversions: number | null;
    ctr: number; // 0..1
    cpm: number;
    cpc: number;
  };
  byDay: Array<{
    date: string;
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
  }>;
  byCampaign: Array<{
    metaCampaignId: string | null;
    name: string | null;
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
  }>;
}

/**
 * Meta 広告タブ用の集計。指定店舗 × 期間で日次インサイトを集計し、
 * 全体合計 / 日別 / キャンペーン別 を返す。
 */
export async function getMetaAdsSummary(params: {
  shopId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<MetaAdsSummary> {
  const { shopId, startDate, endDate } = params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("meta_ad_accounts")
    .select(
      "id, ad_account_id, display_name, last_synced_at, last_sync_error"
    )
    .eq("shop_id", shopId)
    .eq("status", 0)
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const empty: MetaAdsSummary = {
    hasAccount: false,
    accountId: null,
    adAccountId: null,
    displayName: null,
    lastSyncedAt: null,
    lastSyncError: null,
    totals: {
      impressions: 0,
      clicks: 0,
      spend: 0,
      reach: 0,
      conversions: null,
      ctr: 0,
      cpm: 0,
      cpc: 0,
    },
    byDay: [],
    byCampaign: [],
  };

  if (!account) return empty;

  const { data: rows } = await supabase
    .from("meta_ad_insights_daily")
    .select(
      "meta_campaign_id, report_date, impressions, clicks, spend, reach, conversions"
    )
    .eq("ad_account_id", account.id as number)
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: true });

  type Row = {
    meta_campaign_id: string | null;
    report_date: string;
    impressions: number | null;
    clicks: number | null;
    spend: number | null;
    reach: number | null;
    conversions: number | null;
  };
  const data = (rows ?? []) as Row[];

  // キャンペーン名 lookup
  const campaignIds = Array.from(
    new Set(
      data
        .map((r) => r.meta_campaign_id)
        .filter((v): v is string => v != null)
    )
  );
  const campaignNameById = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: cs } = await supabase
      .from("meta_campaigns")
      .select("meta_campaign_id, name")
      .in("meta_campaign_id", campaignIds)
      .is("deleted_at", null);
    for (const c of (cs ?? []) as Array<{
      meta_campaign_id: string;
      name: string | null;
    }>) {
      if (c.name) campaignNameById.set(c.meta_campaign_id, c.name);
    }
  }

  // 集計
  let totalImpr = 0;
  let totalClicks = 0;
  let totalSpend = 0;
  let totalReach = 0;
  let totalConv = 0;
  let convSeen = false;
  const byDayMap = new Map<
    string,
    { impressions: number; clicks: number; spend: number }
  >();
  const byCampaignMap = new Map<
    string,
    { impressions: number; clicks: number; spend: number }
  >();
  for (const r of data) {
    const impr = r.impressions ?? 0;
    const clk = r.clicks ?? 0;
    const sp = r.spend ?? 0;
    totalImpr += impr;
    totalClicks += clk;
    totalSpend += sp;
    totalReach += r.reach ?? 0;
    if (r.conversions != null) {
      totalConv += r.conversions;
      convSeen = true;
    }
    const dayKey = r.report_date;
    const day = byDayMap.get(dayKey) ?? {
      impressions: 0,
      clicks: 0,
      spend: 0,
    };
    day.impressions += impr;
    day.clicks += clk;
    day.spend += sp;
    byDayMap.set(dayKey, day);

    const cKey = r.meta_campaign_id ?? "(unknown)";
    const c = byCampaignMap.get(cKey) ?? {
      impressions: 0,
      clicks: 0,
      spend: 0,
    };
    c.impressions += impr;
    c.clicks += clk;
    c.spend += sp;
    byCampaignMap.set(cKey, c);
  }
  const ctrOf = (impr: number, clk: number) =>
    impr > 0 ? clk / impr : 0;

  return {
    hasAccount: true,
    accountId: account.id as number,
    adAccountId: account.ad_account_id as string,
    displayName: (account.display_name as string | null) ?? null,
    lastSyncedAt: (account.last_synced_at as string | null) ?? null,
    lastSyncError: (account.last_sync_error as string | null) ?? null,
    totals: {
      impressions: totalImpr,
      clicks: totalClicks,
      spend: totalSpend,
      reach: totalReach,
      conversions: convSeen ? totalConv : null,
      ctr: ctrOf(totalImpr, totalClicks),
      cpm: totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    },
    byDay: Array.from(byDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        ...v,
        ctr: ctrOf(v.impressions, v.clicks),
      })),
    byCampaign: Array.from(byCampaignMap.entries())
      .map(([id, v]) => ({
        metaCampaignId: id === "(unknown)" ? null : id,
        name:
          id === "(unknown)" ? "(キャンペーン名不明)" : campaignNameById.get(id) ?? id,
        ...v,
        ctr: ctrOf(v.impressions, v.clicks),
      }))
      .sort((a, b) => b.spend - a.spend),
  };
}
