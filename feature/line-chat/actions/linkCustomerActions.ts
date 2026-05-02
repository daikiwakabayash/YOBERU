"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { verifyLinkToken } from "@/helper/lib/line/liffLinkToken";

export interface LinkResult {
  success: boolean;
  error?: string;
  customerId?: number;
}

/**
 * 共通: lineUserId を customer に紐付け、過去のメッセージにも customer_id
 * を埋め直す。
 *
 * 1 つの lineUserId は同時に複数の顧客に紐付くべきでないため、まず他
 * 顧客に貼られていた同 lineUserId を NULL に戻してから付け替える。
 */
async function applyLink(params: {
  customerId: number;
  lineUserId: string;
}): Promise<LinkResult> {
  const supabase = await createClient();

  // 1. 同じ lineUserId が他顧客に貼られていたら剥がす
  await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("line_user_id", params.lineUserId)
    .neq("id", params.customerId);

  // 2. 対象顧客に貼る
  const { data: updated, error } = await supabase
    .from("customers")
    .update({ line_user_id: params.lineUserId })
    .eq("id", params.customerId)
    .is("deleted_at", null)
    .select("id, shop_id")
    .maybeSingle();
  if (error || !updated) {
    return {
      success: false,
      error: error?.message ?? "顧客が見つかりません",
    };
  }

  // 3. 過去の line_messages.customer_id を埋める (同 shop 内のみ)
  await supabase
    .from("line_messages")
    .update({ customer_id: params.customerId })
    .eq("line_user_id", params.lineUserId)
    .eq("shop_id", updated.shop_id as number)
    .is("customer_id", null);

  revalidatePath("/line-chat");
  revalidatePath(`/line-chat/${params.customerId}`);
  return { success: true, customerId: params.customerId };
}

/**
 * /line-chat の「紐付ける」UI からスタッフが手動で紐付ける。
 */
export async function linkLineUserToCustomer(params: {
  customerId: number;
  lineUserId: string;
}): Promise<LinkResult> {
  if (!params.lineUserId) {
    return { success: false, error: "LINE userId が空です" };
  }
  if (!params.customerId) {
    return { success: false, error: "顧客 ID が空です" };
  }
  return applyLink(params);
}

/**
 * 紐付けを解除する (誤紐付けに気付いた時用)。
 */
export async function unlinkLineUserFromCustomer(params: {
  customerId: number;
}): Promise<LinkResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("id", params.customerId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "顧客が見つかりません",
    };
  }
  revalidatePath("/line-chat");
  revalidatePath(`/line-chat/${params.customerId}`);
  return { success: true, customerId: params.customerId };
}

/**
 * LIFF 経由の自動紐付け。
 *
 * 予約完了画面で生成した署名付きトークン (helper/lib/line/liffLinkToken)
 * を LIFF アプリ内 (/line/liff?action=link&token=...) で受け取り、
 * liff.getProfile() で取得した userId と一緒にこの action を呼ぶ。
 */
export async function linkCustomerByLiffToken(params: {
  token: string;
  lineUserId: string;
}): Promise<LinkResult> {
  if (!params.lineUserId) {
    return { success: false, error: "LINE userId が空です" };
  }
  const verified = verifyLinkToken(params.token);
  if (!verified) {
    return {
      success: false,
      error: "リンクの有効期限が切れたか、無効なトークンです",
    };
  }
  return applyLink({
    customerId: verified.customerId,
    lineUserId: params.lineUserId,
  });
}
