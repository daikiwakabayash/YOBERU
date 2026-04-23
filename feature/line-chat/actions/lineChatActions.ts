"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";
import { revalidatePath } from "next/cache";

/**
 * スタッフが LINE チャット画面から返信を送る。
 *
 * - customer.line_user_id と shop.line_channel_access_token を確認
 * - sendLineMessage で送信 + line_messages に outbound として保存
 * - 失敗時はメッセージ行が残るが delivery_status='failed' / error_message に理由
 */
export async function sendLineReply(params: {
  shopId: number;
  customerId: number;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const text = params.text.trim();
  if (!text) return { success: false, error: "本文が空です" };

  const [customerRes, shopRes, userRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, line_user_id")
      .eq("id", params.customerId)
      .eq("shop_id", params.shopId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("shops")
      .select("line_channel_access_token")
      .eq("id", params.shopId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const lineUserId = customerRes.data?.line_user_id as string | null;
  if (!customerRes.data || !lineUserId) {
    return { success: false, error: "顧客の LINE 連携がありません" };
  }
  const token = shopRes.data?.line_channel_access_token as string | null;
  if (!token) {
    return {
      success: false,
      error: "店舗の LINE Channel Access Token が未設定です",
    };
  }

  // auth.users.email → public.users.id をマッピング (users.email は UNIQUE)
  let sentByUserId: number | null = null;
  const authEmail = userRes.data.user?.email;
  if (authEmail) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("email", authEmail)
      .maybeSingle();
    sentByUserId = (u?.id as number | undefined) ?? null;
  }

  const result = await sendLineMessage({
    to: lineUserId,
    text,
    channelAccessToken: token,
    audit: {
      supabase,
      shopId: params.shopId,
      customerId: params.customerId,
      source: "chat_reply",
      sentByUserId,
    },
  });

  revalidatePath(`/line-chat/${params.customerId}`);
  revalidatePath("/line-chat");

  return { success: result.success, error: result.error };
}

export async function markThreadRead(params: {
  shopId: number;
  customerId: number;
}): Promise<{ success: boolean }> {
  const supabase = await createClient();
  await supabase
    .from("line_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("shop_id", params.shopId)
    .eq("customer_id", params.customerId)
    .eq("direction", "inbound")
    .is("read_at", null);
  revalidatePath("/line-chat");
  return { success: true };
}
