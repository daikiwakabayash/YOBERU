"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface CustomerSearchHit {
  id: number;
  lastName: string | null;
  firstName: string | null;
  phoneNumber1: string | null;
  hasLineUserId: boolean;
}

/**
 * /line-chat の手動紐付け Dialog から呼ぶ顧客検索。
 *
 * - shopId に所属する顧客のみ
 * - keyword は last_name / first_name / last_name_kana / first_name_kana /
 *   phone_number_1 を ilike (部分一致) で検索
 * - 既に line_user_id が埋まっている顧客も結果に含める (上書き紐付けを
 *   許容するため)。UI 側で「LINE 連携済」のラベルを出して注意喚起する
 * - 上限 20 件
 */
export async function searchCustomersForLineLink(params: {
  shopId: number;
  keyword: string;
}): Promise<CustomerSearchHit[]> {
  const keyword = params.keyword.trim();
  if (!keyword) return [];

  const supabase = await createClient();
  const like = `%${keyword.replace(/[%_]/g, "")}%`;

  const { data } = await supabase
    .from("customers")
    .select("id, last_name, first_name, phone_number_1, line_user_id")
    .eq("shop_id", params.shopId)
    .is("deleted_at", null)
    .or(
      [
        `last_name.ilike.${like}`,
        `first_name.ilike.${like}`,
        `last_name_kana.ilike.${like}`,
        `first_name_kana.ilike.${like}`,
        `phone_number_1.ilike.${like}`,
      ].join(",")
    )
    .order("updated_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((c) => ({
    id: c.id as number,
    lastName: (c.last_name as string | null) ?? null,
    firstName: (c.first_name as string | null) ?? null,
    phoneNumber1: (c.phone_number_1 as string | null) ?? null,
    hasLineUserId: !!c.line_user_id,
  }));
}
