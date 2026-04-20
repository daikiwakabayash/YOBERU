"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * 商圏マップ用の手動再 geocode トリガ。
 *
 * geocoded_at をクリアして lat/lng を NULL にし、次回マップアクセス時に
 * 全顧客 (+ 店舗) を改めて geocode し直させる。住所欄を直したり、GSI API
 * の一時的失敗から復旧したいときに使う。
 */
export async function resetGeocode(shopId: number): Promise<{
  ok: boolean;
  resetCustomers: number;
}> {
  const supabase = await createClient();

  // 顧客側
  const { data: customers, error: cErr } = await supabase
    .from("customers")
    .update({ latitude: null, longitude: null, geocoded_at: null })
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .select("id");

  // 店舗側
  await supabase
    .from("shops")
    .update({ latitude: null, longitude: null, geocoded_at: null })
    .eq("id", shopId);

  revalidatePath("/marketing");
  return {
    ok: !cErr,
    resetCustomers: customers?.length ?? 0,
  };
}
