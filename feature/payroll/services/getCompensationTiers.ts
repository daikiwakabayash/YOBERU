"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface CompensationTier {
  id: number;
  salesThreshold: number; // 税抜売上の閾値
  percentage: number;     // この閾値以上のとき適用される %
}

/**
 * ブランドの業務委託費テーブル (sales_threshold → percentage)。
 * sales_threshold 昇順で返す。
 *
 * migration 00032 が未適用な環境では table 不在エラーで落ちないよう、
 * "compensation_tiers" 検出 + PGRST205 / 42P01 を catch して空配列を
 * 返す。給与計算ページが空表示になるが他機能は動く。
 */
export async function getCompensationTiers(
  brandId: number
): Promise<CompensationTier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compensation_tiers")
    .select("id, sales_threshold, percentage")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sales_threshold", { ascending: true });
  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("compensation_tiers") ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw error;
  }
  return (data ?? []).map((d) => ({
    id: d.id as number,
    salesThreshold: d.sales_threshold as number,
    percentage: Number(d.percentage),
  }));
}
