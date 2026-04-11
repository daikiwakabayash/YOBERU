"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface UpsertAdSpendInput {
  brand_id: number;
  shop_id: number;
  visit_source_id: number;
  year_month: string; // 'YYYY-MM'
  amount: number;
  memo?: string | null;
}

/**
 * Insert or update a single ad spend row keyed on
 * (shop_id, visit_source_id, year_month).
 *
 * Two-step because the unique index is partial (WHERE deleted_at IS NULL)
 * which Postgres accepts but some Supabase typegen configs reject for
 * ON CONFLICT. Read-then-write keeps things portable.
 */
export async function upsertAdSpend(input: UpsertAdSpendInput) {
  const supabase = await createClient();

  // Basic validation
  if (!input.year_month || !/^\d{4}-\d{2}$/.test(input.year_month)) {
    return { error: "月の形式が正しくありません (YYYY-MM)" };
  }
  if (!input.shop_id || !input.visit_source_id) {
    return { error: "店舗と媒体を選択してください" };
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { error: "金額は 0 以上の数値を入力してください" };
  }

  function friendlyError(raw: unknown): string {
    const msg =
      raw && typeof raw === "object"
        ? String((raw as { message?: string }).message ?? "")
        : String(raw ?? "");
    if (
      msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      msg.toLowerCase().includes("ad_spend")
    ) {
      return "広告費テーブルが未作成です。Supabase で migration 00007_marketing_and_member_plans.sql を実行してください。";
    }
    return msg || "広告費の保存に失敗しました";
  }

  try {
    const { data: existing, error: lookupErr } = await supabase
      .from("ad_spend")
      .select("id")
      .eq("shop_id", input.shop_id)
      .eq("visit_source_id", input.visit_source_id)
      .eq("year_month", input.year_month)
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupErr) return { error: friendlyError(lookupErr) };

    if (existing?.id) {
      const { error } = await supabase
        .from("ad_spend")
        .update({
          amount: input.amount,
          memo: input.memo ?? null,
        })
        .eq("id", existing.id);
      if (error) return { error: friendlyError(error) };
    } else {
      const { error } = await supabase.from("ad_spend").insert({
        brand_id: input.brand_id,
        shop_id: input.shop_id,
        visit_source_id: input.visit_source_id,
        year_month: input.year_month,
        amount: input.amount,
        memo: input.memo ?? null,
      });
      if (error) return { error: friendlyError(error) };
    }

    revalidatePath("/ad-spend");
    revalidatePath("/marketing");
    return { success: true };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export async function deleteAdSpend(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ad_spend")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ad-spend");
  revalidatePath("/marketing");
  return { success: true };
}
