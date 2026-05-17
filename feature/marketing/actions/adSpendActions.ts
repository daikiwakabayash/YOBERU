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
  /** 強制リンク (= クリエイティブ) 単位の広告費。NULL = 媒体全体 */
  booking_link_id?: number | null;
}

/**
 * Insert or update a single ad spend row.
 *
 * 一意キーは (shop_id, year_month, visit_source_id, booking_link_id):
 *   - booking_link_id NULL: 従来通り「媒体全体の月次広告費」
 *   - booking_link_id NOT NULL: 強制リンク (クリエイティブ) 単位の広告費
 *
 * Two-step (read-then-write) で行う理由は、partial unique index
 * (WHERE deleted_at IS NULL) が ON CONFLICT 経由で扱いづらいため。
 *
 * 00050 未適用環境では booking_link_id カラムが無いので、書き込み時に
 * カラム不在エラーが出たら booking_link_id 抜きでリトライする。
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

  const bookingLinkId =
    input.booking_link_id != null && input.booking_link_id > 0
      ? input.booking_link_id
      : null;

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

  function isMissingBookingLinkColumn(raw: unknown): boolean {
    const msg =
      raw && typeof raw === "object"
        ? String((raw as { message?: string }).message ?? "")
        : String(raw ?? "");
    return (
      msg.includes("booking_link_id") &&
      (msg.includes("column") || msg.includes("schema cache"))
    );
  }

  try {
    // 既存行を探す: booking_link_id が NULL かどうかで条件式を変える
    let lookupQuery = supabase
      .from("ad_spend")
      .select("id")
      .eq("shop_id", input.shop_id)
      .eq("visit_source_id", input.visit_source_id)
      .eq("year_month", input.year_month)
      .is("deleted_at", null);
    if (bookingLinkId == null) {
      lookupQuery = lookupQuery.is("booking_link_id", null);
    } else {
      lookupQuery = lookupQuery.eq("booking_link_id", bookingLinkId);
    }
    let lookup = await lookupQuery.maybeSingle();
    if (lookup.error && isMissingBookingLinkColumn(lookup.error)) {
      // 00050 未適用 → booking_link_id 条件を外して再検索
      lookup = await supabase
        .from("ad_spend")
        .select("id")
        .eq("shop_id", input.shop_id)
        .eq("visit_source_id", input.visit_source_id)
        .eq("year_month", input.year_month)
        .is("deleted_at", null)
        .maybeSingle();
    }
    if (lookup.error) return { error: friendlyError(lookup.error) };

    if (lookup.data?.id) {
      const updatePayload: Record<string, unknown> = {
        amount: input.amount,
        memo: input.memo ?? null,
      };
      if (bookingLinkId != null) {
        updatePayload.booking_link_id = bookingLinkId;
      }
      let { error } = await supabase
        .from("ad_spend")
        .update(updatePayload)
        .eq("id", lookup.data.id);
      if (error && isMissingBookingLinkColumn(error)) {
        delete updatePayload.booking_link_id;
        const retry = await supabase
          .from("ad_spend")
          .update(updatePayload)
          .eq("id", lookup.data.id);
        error = retry.error;
      }
      if (error) return { error: friendlyError(error) };
    } else {
      const insertPayload: Record<string, unknown> = {
        brand_id: input.brand_id,
        shop_id: input.shop_id,
        visit_source_id: input.visit_source_id,
        year_month: input.year_month,
        amount: input.amount,
        memo: input.memo ?? null,
      };
      if (bookingLinkId != null) {
        insertPayload.booking_link_id = bookingLinkId;
      }
      let { error } = await supabase.from("ad_spend").insert(insertPayload);
      if (error && isMissingBookingLinkColumn(error)) {
        delete insertPayload.booking_link_id;
        const retry = await supabase.from("ad_spend").insert(insertPayload);
        error = retry.error;
      }
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
