import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import { syncMetaAds } from "@/feature/ad-spend/services/syncMetaAds";
import { syncTikTokAds } from "@/feature/ad-spend/services/syncTikTokAds";

/**
 * 広告 API 同期 Cron エンドポイント。
 *
 * Deployment:
 *   - Vercel Cron: vercel.json で 30 分間隔指定
 *     {"crons":[{"path":"/api/cron/sync-ads","schedule":"*\/30 * * * *"}]}
 *   - 外部 cron: GET /api/cron/sync-ads
 *     ヘッダ Authorization: Bearer <CRON_SECRET>
 *
 * 処理内容:
 *   1. shops を全件走査し、Meta / TikTok の token が登録されている店舗を抽出
 *   2. 各店舗に対して syncMetaAds / syncTikTokAds を順次実行
 *   3. 結果を ad_sync_logs に記録 (sync 関数内で実装)
 *
 * 失敗した店舗があっても処理は続行する (1 店舗の token 期限切れで全店舗が
 * 止まらないように)。最終的に { results: [...] } を 200 で返す。
 */

function requireCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 開発時は素通し
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface ShopRow {
  id: number;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  tiktok_advertiser_id: string | null;
  tiktok_access_token: string | null;
}

export async function GET(request: NextRequest) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select(
      "id, meta_ad_account_id, meta_access_token, tiktok_advertiser_id, tiktok_access_token"
    )
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json(
      { error: `shops query failed: ${error.message}` },
      { status: 500 }
    );
  }

  const shops = (data ?? []) as ShopRow[];
  const results: Array<{
    shopId: number;
    platform: "meta" | "tiktok";
    ok: boolean;
    fetchedRows: number;
    error?: string;
  }> = [];

  for (const shop of shops) {
    if (shop.meta_ad_account_id && shop.meta_access_token) {
      const r = await syncMetaAds(shop.id, "cron");
      results.push({ shopId: shop.id, platform: "meta", ...r });
    }
    if (shop.tiktok_advertiser_id && shop.tiktok_access_token) {
      const r = await syncTikTokAds(shop.id, "cron");
      results.push({ shopId: shop.id, platform: "tiktok", ...r });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  return NextResponse.json({
    ok: true,
    summary: { totalShops: shops.length, success: okCount, failed: failCount },
    results,
  });
}
