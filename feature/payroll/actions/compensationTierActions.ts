"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * 業務委託費テーブルの 1 行を upsert する。
 * 同じ (brand_id, sales_threshold) があれば percentage を上書き、無ければ
 * INSERT。閾値そのものを変更したい場合は deleteCompensationTier + create で
 * 表現する (PK が自動採番のため、threshold は immutable な行 key として扱う)。
 */
export async function upsertCompensationTier(params: {
  brandId: number;
  salesThreshold: number;
  percentage: number;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { brandId, salesThreshold, percentage } = params;

  if (!Number.isFinite(salesThreshold) || salesThreshold < 0) {
    return { error: "売上閾値は 0 以上の整数で入力してください" };
  }
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return { error: "% は 0 〜 100 の範囲で入力してください" };
  }

  const { error } = await supabase
    .from("compensation_tiers")
    .upsert(
      {
        brand_id: brandId,
        sales_threshold: Math.round(salesThreshold),
        percentage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,sales_threshold" }
    );
  if (error) return { error: error.message };

  revalidatePath("/payroll/tiers");
  revalidatePath("/payroll");
  return { success: true };
}

/**
 * 1 行を soft delete (deleted_at を立てる)。
 */
export async function deleteCompensationTier(
  id: number
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("compensation_tiers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/payroll/tiers");
  revalidatePath("/payroll");
  return { success: true };
}
