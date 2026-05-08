"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";

/**
 * スタッフ × 月 の口コミ獲得数を upsert する。
 *
 * UI からは 1 つのフィールドだけ更新したい場合があるので
 * google / hotpepper どちらも省略可。値だけ受け取った側を更新し、
 * 省略側は既存値を保持する。
 *
 * 値は 0 以上の整数のみ受け付ける。
 */
export async function setStaffReviewCount(params: {
  staffId: number;
  yearMonth: string; // "YYYY-MM"
  google?: number;
  hotpepper?: number;
}): Promise<{ success: true } | { error: string }> {
  if (!/^\d{4}-\d{2}$/.test(params.yearMonth)) {
    return { error: "year_month の形式が不正です (YYYY-MM)" };
  }
  if (
    params.google != null &&
    (!Number.isFinite(params.google) || params.google < 0)
  ) {
    return { error: "G口コミの件数は 0 以上の整数で入力してください" };
  }
  if (
    params.hotpepper != null &&
    (!Number.isFinite(params.hotpepper) || params.hotpepper < 0)
  ) {
    return { error: "H口コミの件数は 0 以上の整数で入力してください" };
  }

  const supabase = await createClient();
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // 既存行を読んで、未指定側は維持する
  const { data: existing } = await supabase
    .from("staff_review_counts")
    .select("id, google_count, hotpepper_count")
    .eq("staff_id", params.staffId)
    .eq("year_month", params.yearMonth)
    .is("deleted_at", null)
    .maybeSingle();

  const nextGoogle =
    params.google != null
      ? Math.floor(params.google)
      : (existing?.google_count as number | undefined) ?? 0;
  const nextHotpepper =
    params.hotpepper != null
      ? Math.floor(params.hotpepper)
      : (existing?.hotpepper_count as number | undefined) ?? 0;

  if (existing) {
    const { error } = await supabase
      .from("staff_review_counts")
      .update({
        google_count: nextGoogle,
        hotpepper_count: nextHotpepper,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("staff_review_counts").insert({
      brand_id: brandId,
      shop_id: shopId,
      staff_id: params.staffId,
      year_month: params.yearMonth,
      google_count: nextGoogle,
      hotpepper_count: nextHotpepper,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/sales");
  return { success: true };
}
