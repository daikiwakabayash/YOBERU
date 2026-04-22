"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface LineFriendStats {
  /** 顧客総数 (論理削除されていない) */
  totalCustomers: number;
  /** そのうち line_user_id が非 NULL = 公式アカウント友だち化済 */
  lineFriends: number;
  /** lineFriends / totalCustomers。友だち化率 (0〜1) */
  friendRate: number;
  /** 当月新規来院の友だち化率。新規導線 (予約完了 → LINE 追加) の実効値。
   *  last_visit_date が当月の顧客のみを母集団とする。 */
  newCustomerFriendRate: number;
  /** 当月新規の総数 (母集団サイズ開示用) */
  newCustomerTotal: number;
}

/**
 * LINE 公式アカウントの友だち化率を算出する。
 *
 * マーケ流入 → 予約完了 → LINE 追加 のファネルで、最後の
 * "LINE 追加率" が上がるほどリテンションコスト (= CAC 回収期間) が
 * 改善する。ダッシュボード上部にこの KPI を常時出すことで、予約完了
 * 画面の LINE 追加導線の A/B を回す動機づけにする。
 */
export async function getLineFriendStats(
  shopId: number
): Promise<LineFriendStats> {
  const supabase = await createClient();

  // 総数 + 友だち化済みを一括取得
  const { data: rows } = await supabase
    .from("customers")
    .select("id, line_user_id, created_at")
    .eq("shop_id", shopId)
    .is("deleted_at", null);

  const all = (rows ?? []) as Array<{
    id: number;
    line_user_id: string | null;
    created_at: string | null;
  }>;

  const totalCustomers = all.length;
  const lineFriends = all.filter((r) => !!r.line_user_id).length;

  // 当月新規の母集団: created_at が JST 今月内
  const jstNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  const monthStart = new Date(jstNow.getFullYear(), jstNow.getMonth(), 1);
  const monthStartMs = monthStart.getTime();

  const newThisMonth = all.filter((r) => {
    if (!r.created_at) return false;
    const t = new Date(r.created_at).getTime();
    return Number.isFinite(t) && t >= monthStartMs;
  });
  const newCustomerTotal = newThisMonth.length;
  const newCustomerFriendCount = newThisMonth.filter(
    (r) => !!r.line_user_id
  ).length;

  return {
    totalCustomers,
    lineFriends,
    friendRate:
      totalCustomers > 0 ? lineFriends / totalCustomers : 0,
    newCustomerFriendRate:
      newCustomerTotal > 0
        ? newCustomerFriendCount / newCustomerTotal
        : 0,
    newCustomerTotal,
  };
}
