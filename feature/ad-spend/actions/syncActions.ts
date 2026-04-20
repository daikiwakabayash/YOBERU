"use server";

import { revalidatePath } from "next/cache";
import { syncMetaAds } from "../services/syncMetaAds";
import { syncTikTokAds } from "../services/syncTikTokAds";

/**
 * `/ad-spend` ページの「今すぐ同期」ボタンから呼ばれるサーバーアクション。
 * 指定店舗の Meta / TikTok 両方を順次走らせて、結果を集約して返す。
 */
export async function manualSyncShop(shopId: number): Promise<{
  ok: boolean;
  results: Array<{
    platform: "meta" | "tiktok";
    ok: boolean;
    fetchedRows: number;
    error?: string;
  }>;
}> {
  const meta = await syncMetaAds(shopId, "manual");
  const tiktok = await syncTikTokAds(shopId, "manual");
  revalidatePath("/ad-spend");
  revalidatePath("/marketing");
  return {
    ok: meta.ok || tiktok.ok,
    results: [
      { platform: "meta", ...meta },
      { platform: "tiktok", ...tiktok },
    ],
  };
}
