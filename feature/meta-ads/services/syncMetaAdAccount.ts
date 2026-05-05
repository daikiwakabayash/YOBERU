"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { fetchCampaigns, fetchDailyInsights } from "./metaGraphClient";
import { decryptToken } from "./tokenCrypto";

/**
 * 1 アカウント分の同期。cron / 手動ボタンの両方から呼ばれる。
 *
 * 流れ:
 *   1. meta_sync_runs に pending row を立てる
 *   2. キャンペーンマスター取得 → meta_campaigns upsert
 *   3. 日次インサイト取得 (デフォルトは過去 31 日 + 今日)
 *      → meta_ad_insights_daily upsert
 *   4. meta_ad_accounts.last_synced_at を更新、run を ok / error にする
 *
 * 失敗しても他のアカウントの sync を巻き込まないよう、ここでは throw
 * せず result を返す。
 */
export async function syncMetaAdAccount(
  metaAdAccountRowId: number
): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: account, error: accErr } = await supabase
    .from("meta_ad_accounts")
    .select(
      "id, ad_account_id, access_token_encrypted, status, sync_interval_min"
    )
    .eq("id", metaAdAccountRowId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { ok: false, error: accErr?.message ?? "account not found" };
  }
  if (account.status !== 0) {
    return { ok: false, error: "account is disabled" };
  }
  if (!account.access_token_encrypted) {
    return { ok: false, error: "no access token configured" };
  }

  const { data: runRow } = await supabase
    .from("meta_sync_runs")
    .insert({ ad_account_id: account.id, status: "pending" })
    .select("id")
    .maybeSingle();

  try {
    const accessToken = decryptToken(
      account.access_token_encrypted as string
    );

    // 1. キャンペーンマスター
    const campaigns = await fetchCampaigns({
      accessToken,
      adAccountId: account.ad_account_id as string,
    });
    if (campaigns.length > 0) {
      const rows = campaigns.map((c) => ({
        ad_account_id: account.id,
        meta_campaign_id: c.id,
        meta_adset_id: null,
        meta_ad_id: null,
        name: c.name ?? null,
        objective: c.objective ?? null,
        status: c.status ?? null,
        daily_budget: c.daily_budget ? Number(c.daily_budget) : null,
        lifetime_budget: c.lifetime_budget
          ? Number(c.lifetime_budget)
          : null,
        start_time: c.start_time ?? null,
        stop_time: c.stop_time ?? null,
        updated_at: new Date().toISOString(),
      }));
      await supabase
        .from("meta_campaigns")
        .upsert(rows, {
          onConflict: "meta_campaign_id,meta_adset_id,meta_ad_id",
        });
    }

    // 2. 日次インサイト (直近 31 日 + 今日)
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 31);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    const insights = await fetchDailyInsights({
      accessToken,
      adAccountId: account.ad_account_id as string,
      since: fmt(since),
      until: fmt(today),
    });

    let upserted = 0;
    if (insights.length > 0) {
      const rows = insights.map((i) => {
        const impressions = Number(i.impressions ?? "0");
        const clicks = Number(i.clicks ?? "0");
        const spend = Math.round(Number(i.spend ?? "0"));
        const ctr = i.ctr ? Number(i.ctr) / 100 : impressions > 0
          ? clicks / impressions
          : 0;
        const cpm = i.cpm ? Number(i.cpm) : impressions > 0
          ? (spend / impressions) * 1000
          : 0;
        const cpc = i.cpc ? Number(i.cpc) : clicks > 0 ? spend / clicks : 0;
        // conversions = actions の中で typeof "offsite_conversion" 等を sum。
        // 取れなければ NULL のままで、CVR は appointments 側から派生。
        let conversions: number | null = null;
        if (Array.isArray(i.actions)) {
          const conv = i.actions
            .filter((a) =>
              [
                "lead",
                "complete_registration",
                "purchase",
                "offsite_conversion.fb_pixel_lead",
                "offsite_conversion.fb_pixel_purchase",
              ].includes(a.action_type)
            )
            .reduce((s, a) => s + Number(a.value || 0), 0);
          conversions = conv;
        }
        return {
          ad_account_id: account.id,
          meta_campaign_id: i.campaign_id ?? null,
          report_date: i.date_start,
          impressions,
          clicks,
          spend,
          reach: Number(i.reach ?? "0"),
          conversions,
          cpm: Number.isFinite(cpm) ? cpm.toFixed(2) : "0.00",
          cpc: Number.isFinite(cpc) ? cpc.toFixed(2) : "0.00",
          ctr: Number.isFinite(ctr) ? ctr.toFixed(4) : "0.0000",
          fetched_at: new Date().toISOString(),
        };
      });
      const { error: upErr } = await supabase
        .from("meta_ad_insights_daily")
        .upsert(rows, {
          onConflict: "ad_account_id,meta_campaign_id,report_date",
        });
      if (upErr) throw upErr;
      upserted = rows.length;
    }

    await supabase
      .from("meta_ad_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("id", account.id);
    if (runRow?.id) {
      await supabase
        .from("meta_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "ok",
          rows_upserted: upserted,
        })
        .eq("id", runRow.id);
    }
    return { ok: true, rows: upserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("meta_ad_accounts")
      .update({ last_sync_error: msg })
      .eq("id", account.id);
    if (runRow?.id) {
      await supabase
        .from("meta_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: msg,
        })
        .eq("id", runRow.id);
    }
    return { ok: false, error: msg };
  }
}
