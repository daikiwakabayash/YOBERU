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
  /** 配布数 / 表示回数 (= チラシ枚数 or 広告 impressions)。null/未指定で
   *  既存値を維持しない (= 上書き先で null になる)。0 を保存したい場合は
   *  明示的に 0 を渡す。 */
  impressions?: number | null;
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
    const code =
      raw && typeof raw === "object"
        ? String((raw as { code?: string }).code ?? "")
        : "";
    // 「テーブルそのものが無い」ときだけ migration 案内を出す。列の欠落や
    // ユニーク制約違反など、テーブルは在るのに失敗したケースで誤って
    // 「テーブル未作成」と案内しないよう、検出条件を厳密に絞る。
    if (
      code === "42P01" ||
      code === "PGRST205" ||
      /relation ["']?ad_spend["']? does not exist/i.test(msg) ||
      (msg.includes("ad_spend") && msg.toLowerCase().includes("find the table"))
    ) {
      return "広告費テーブルが未作成です。Supabase で migration 00007_marketing_and_member_plans.sql を実行してください。";
    }
    // ユニーク制約違反 (古い uk_ad_spend_shop_source_month_active が残って
    // いる環境で、媒体単位と強制リンク単位が衝突するケース) は migration
    // 00054 の案内を出す。
    if (
      code === "23505" ||
      msg.toLowerCase().includes("duplicate key") ||
      msg.includes("uk_ad_spend_shop_source_month_active")
    ) {
      return "同じ月 × 媒体の広告費が既に登録されています。媒体単位と強制リンク単位が衝突している場合は、Supabase で migration 00054_fix_ad_spend_stale_unique_index.sql を実行してください。";
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
      if (input.impressions != null && Number.isFinite(input.impressions)) {
        updatePayload.impressions = Math.max(0, Math.floor(input.impressions));
      }
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
      if (input.impressions != null && Number.isFinite(input.impressions)) {
        insertPayload.impressions = Math.max(0, Math.floor(input.impressions));
      }
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
