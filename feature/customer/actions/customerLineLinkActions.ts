"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/helper/lib/supabase/server";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";

/**
 * 顧客 LINE 紐付け用 URL を本部側から LINE で顧客に送付する
 * (顧客の line_user_id が既に分かっているケース)。
 *
 * 通常は line_user_id が無いから紐付けたいわけだが、
 * 例えば友だち追加だけ済んでいて顧客 DB と紐付け直したいケース等で使う。
 */
export async function sendLineLinkInvite(params: {
  customerId: number;
  appUrl: string;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, shop_id, line_user_id, line_link_token, last_name, first_name")
    .eq("id", params.customerId)
    .maybeSingle();
  if (!customer) return { error: "顧客が見つかりません" };
  if (!customer.line_user_id) {
    return {
      error:
        "この顧客の LINE userId が未取得です。先に顧客側でリンクを開いてもらう必要があります。",
    };
  }
  if (!customer.line_link_token) {
    return { error: "紐付けトークンが未発行です。再読込で自動発行されます。" };
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("name, line_channel_access_token")
    .eq("id", customer.shop_id as number)
    .maybeSingle();
  if (!shop?.line_channel_access_token) {
    return { error: "店舗の LINE Channel Access Token が未設定です" };
  }

  const link = `${params.appUrl.replace(/\/$/, "")}/line/link/${customer.line_link_token}`;
  const name =
    [customer.last_name, customer.first_name].filter(Boolean).join(" ") ||
    "お客様";

  const text = `${name} 様

予約状況の確認・キャンセルは下記のリンクからご利用いただけます。

${link}

※ この URL は ${name} 様専用です。`;

  const r = await sendLineMessage({
    to: customer.line_user_id as string,
    text,
    channelAccessToken: shop.line_channel_access_token as string,
  });
  if (!r.success) {
    return { error: r.error ?? "LINE 送信に失敗しました" };
  }
  revalidatePath(`/customer/${params.customerId}`);
  return { success: true };
}

/**
 * line_user_id を顧客 DB と紐付け解除する (本部から手動でリセット)。
 */
export async function unlinkLineUser(params: {
  customerId: number;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("id", params.customerId);
  if (error) return { error: error.message };
  revalidatePath(`/customer/${params.customerId}`);
  return { success: true };
}
