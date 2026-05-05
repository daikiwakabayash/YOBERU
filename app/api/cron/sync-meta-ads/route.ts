import { NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import { syncMetaAdAccount } from "@/feature/meta-ads/services/syncMetaAdAccount";

export const dynamic = "force-dynamic";

/**
 * Meta 広告アカウント同期 cron。
 *
 * 呼び出し方:
 *   - Vercel Cron で 6 時間に 1 回 (推奨。レート制限と料金のバランス)。
 *     vercel.json に "/api/cron/sync-meta-ads" を 0 stage 6 で。
 *   - 手動 backfill: ?accountId=<n> でその 1 アカウントだけ即時実行。
 *
 * 認証:
 *   Vercel Cron は x-vercel-cron ヘッダを付ける。それが無い場合は
 *   CRON_SECRET ヘッダ (= env: CRON_SECRET) で代替。両方無ければ 401。
 */
export async function GET(req: Request) {
  // 認証チェック
  const headers = req.headers;
  const isVercelCron = headers.get("x-vercel-cron") != null;
  const providedSecret =
    headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (
    !isVercelCron &&
    (!expectedSecret || providedSecret !== expectedSecret)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const onlyId = url.searchParams.get("accountId");

  const supabase = await createClient();
  let query = supabase
    .from("meta_ad_accounts")
    .select("id, sync_interval_min, last_synced_at, status")
    .is("deleted_at", null)
    .eq("status", 0);
  if (onlyId) query = query.eq("id", Number(onlyId));
  const { data: accounts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const targets = (accounts ?? []).filter((a) => {
    if (onlyId) return true; // 手動指定は間隔チェックをスキップ
    const interval = (a.sync_interval_min as number | null) ?? 360;
    if (!interval) return false;
    if (!a.last_synced_at) return true;
    const last = new Date(a.last_synced_at as string).getTime();
    return now - last >= interval * 60 * 1000;
  });

  const results = [];
  for (const acc of targets) {
    const r = await syncMetaAdAccount(acc.id as number);
    results.push({ accountId: acc.id, ...r });
  }
  return NextResponse.json({
    triggered: results.length,
    skipped: (accounts ?? []).length - results.length,
    results,
  });
}
