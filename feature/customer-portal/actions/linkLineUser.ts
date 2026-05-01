"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/helper/lib/supabase/server";

/**
 * line_link_token 付きの URL から、LIFF で取得した line_user_id を顧客に
 * 紐付ける。同じ line_user_id が他の顧客に紐付いていても、最新のリンクを
 * 優先するため上書きする (顧客が複数回リンクを踏んだ場合の救済)。
 */
export async function linkLineUserToCustomer(params: {
  token: string;
  lineUserId: string;
  displayName?: string | null;
}): Promise<{
  success?: true;
  error?: string;
  customerId?: number;
}> {
  const supabase = await createClient();
  const { token, lineUserId } = params;

  if (!token || !lineUserId) {
    return { error: "token / lineUserId が未指定です" };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, line_user_id")
    .eq("line_link_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) {
    return {
      error:
        "リンクが無効です。店舗で発行された最新のリンクを使用してください。",
    };
  }

  // 同じ line_user_id が別顧客に紐付いていれば外す (1 LINE = 1 顧客に統一)
  await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("line_user_id", lineUserId)
    .neq("id", customer.id);

  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: lineUserId })
    .eq("id", customer.id);
  if (error) return { error: error.message };

  revalidatePath(`/customer/${customer.id}`);
  return { success: true, customerId: customer.id as number };
}
