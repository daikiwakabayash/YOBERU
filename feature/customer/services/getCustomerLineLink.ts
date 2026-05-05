"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface CustomerLineLinkInfo {
  token: string;
  /** 顧客に送付する URL (/line/link/<token>) */
  url: string;
  lineUserId: string | null;
  /** 店舗の公式 LINE 友だち追加 URL (任意設定) */
  shopAddFriendUrl: string | null;
}

/**
 * 顧客固有の LINE 紐付けリンク情報を取得。
 * - token が未発行なら自動発行 (UUID v4) して保存。
 * - 既に line_user_id が紐付いている場合もトークンは保持して返す。
 */
export async function getCustomerLineLink(params: {
  customerId: number;
  baseUrl: string;
}): Promise<CustomerLineLinkInfo | null> {
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, line_user_id, line_link_token, shop_id")
    .eq("id", params.customerId)
    .maybeSingle();
  if (!customer) return null;

  let token = (customer.line_link_token as string | null) ?? "";
  if (!token) {
    token = crypto.randomUUID();
    await supabase
      .from("customers")
      .update({ line_link_token: token })
      .eq("id", params.customerId);
  }

  // 店舗の友だち追加 URL も拾う (案内文に併記するため)
  const { data: shop } = await supabase
    .from("shops")
    .select("line_add_friend_url")
    .eq("id", customer.shop_id as number)
    .maybeSingle();

  const url = `${params.baseUrl.replace(/\/$/, "")}/line/link/${token}`;

  return {
    token,
    url,
    lineUserId: (customer.line_user_id as string | null) ?? null,
    shopAddFriendUrl: (shop?.line_add_friend_url as string | null) ?? null,
  };
}
