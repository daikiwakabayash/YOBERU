import "server-only";

import { createClient } from "@/helper/lib/supabase/server";

export interface StaffReviewCount {
  staffId: number;
  googleCount: number;
  hotpepperCount: number;
}

/**
 * 指定店舗 × 月 の スタッフ口コミ獲得数 を取得する。
 *
 * 入力なし (= 行が無い) スタッフは Map に乗らない → UI 側で 0 として扱う。
 * テーブル未作成 (migration 00045 未適用) でも空 Map で返してダッシュ
 * ボードを落とさない。
 */
export async function getStaffReviewCounts(
  shopId: number,
  yearMonth: string
): Promise<Map<number, StaffReviewCount>> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("staff_review_counts")
      .select("staff_id, google_count, hotpepper_count")
      .eq("shop_id", shopId)
      .eq("year_month", yearMonth)
      .is("deleted_at", null);
    if (error) {
      const msg = String(error.message ?? "");
      if (
        msg.includes("does not exist") ||
        msg.toLowerCase().includes("staff_review_counts")
      ) {
        return new Map();
      }
      console.error("[getStaffReviewCounts]", error);
      return new Map();
    }
    const m = new Map<number, StaffReviewCount>();
    for (const r of (data ?? []) as Array<{
      staff_id: number;
      google_count: number | null;
      hotpepper_count: number | null;
    }>) {
      m.set(r.staff_id, {
        staffId: r.staff_id,
        googleCount: r.google_count ?? 0,
        hotpepperCount: r.hotpepper_count ?? 0,
      });
    }
    return m;
  } catch {
    return new Map();
  }
}
