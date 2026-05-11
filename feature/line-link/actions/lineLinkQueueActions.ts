"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/helper/lib/supabase/server";
import { getActiveShopId } from "@/helper/lib/shop-context";

/**
 * 認証済 auth user の email → public.users.id を解決する。
 * 既存の line-chat / agreement 等と同じパターン。
 */
async function resolveCurrentStaffUserId(
  supabase: SupabaseClient
): Promise<number | null> {
  const { data: userResp } = await supabase.auth.getUser();
  const authEmail = userResp.user?.email;
  if (!authEmail) return null;
  const { data: u } = await supabase
    .from("users")
    .select("id")
    .eq("email", authEmail)
    .maybeSingle();
  return (u?.id as number | undefined) ?? null;
}

export interface AssignResult {
  success?: true;
  error?: string;
  /**
   * 既存の line_user_id が顧客に紐付いていて、上書きには確認が必要な場合に
   * 立つ。UI はこのフラグを見て確認ダイアログを表示し、force=true で再要求する。
   */
  requiresConfirmation?: {
    existingCustomerId: number;
    existingCustomerName: string;
    existingCustomerCode: string;
  };
}

/**
 * pending_line_links 行を顧客にマッチさせて、customers.line_user_id を
 * 書き込む。誤紐付け事故を防ぐため:
 *   - pending の shop_id と顧客の shop_id が一致しないと拒否
 *   - 顧客が既に別の line_user_id を持っている場合は force=true 必須
 *   - 同じ LINE userId が別顧客に紐付いていれば force=true 必須
 */
export async function assignPendingLineLink(params: {
  pendingId: number;
  customerId: number;
  force?: boolean;
}): Promise<AssignResult> {
  const supabase = await createClient();
  const activeShopId = await getActiveShopId();

  const { data: pending } = await supabase
    .from("pending_line_links")
    .select(
      "id, shop_id, line_user_id, matched_customer_id, dismissed_at, deleted_at"
    )
    .eq("id", params.pendingId)
    .maybeSingle();
  if (!pending) return { error: "対象の保留行が見つかりません" };
  if (pending.deleted_at) return { error: "保留行は既に削除されています" };
  if (pending.matched_customer_id)
    return { error: "この保留はすでにマッチ済みです" };
  if (pending.dismissed_at)
    return { error: "この保留はすでに破棄されています" };
  if ((pending.shop_id as number) !== activeShopId) {
    return {
      error:
        "選択中の店舗と保留行の店舗が一致しません。店舗を切り替えてください。",
    };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, shop_id, line_user_id, code, last_name, first_name")
    .eq("id", params.customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { error: "顧客が見つかりません" };
  if ((customer.shop_id as number) !== activeShopId) {
    return {
      error: "顧客の所属店舗が現在の選択店舗と一致しません",
    };
  }

  const lineUserId = pending.line_user_id as string;

  // 顧客が既に別の LINE userId を持っているケース
  if (
    customer.line_user_id &&
    (customer.line_user_id as string) !== lineUserId &&
    !params.force
  ) {
    return {
      error:
        "この顧客は既に別の LINE アカウントが紐付けられています。上書きするには確認が必要です。",
      requiresConfirmation: {
        existingCustomerId: customer.id as number,
        existingCustomerName:
          [customer.last_name, customer.first_name]
            .filter(Boolean)
            .join(" ") || "(名前未設定)",
        existingCustomerCode: (customer.code as string) ?? "",
      },
    };
  }

  // 同じ LINE userId が別顧客に既に紐付いているケース
  const { data: conflict } = await supabase
    .from("customers")
    .select("id, code, last_name, first_name")
    .eq("line_user_id", lineUserId)
    .neq("id", params.customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (conflict && !params.force) {
    return {
      error:
        "この LINE アカウントは別の顧客に紐付いています。上書きするには確認が必要です。",
      requiresConfirmation: {
        existingCustomerId: conflict.id as number,
        existingCustomerName:
          [conflict.last_name, conflict.first_name]
            .filter(Boolean)
            .join(" ") || "(名前未設定)",
        existingCustomerCode: (conflict.code as string) ?? "",
      },
    };
  }

  // 競合がいる場合は force で先に外す
  if (conflict && params.force) {
    await supabase
      .from("customers")
      .update({ line_user_id: null })
      .eq("id", conflict.id as number);
  }

  // 顧客に line_user_id をセット
  const { error: upErr } = await supabase
    .from("customers")
    .update({ line_user_id: lineUserId })
    .eq("id", params.customerId);
  if (upErr) return { error: upErr.message };

  // pending をマッチ済みに (操作したスタッフを記録)
  const staffUserId = await resolveCurrentStaffUserId(supabase);

  await supabase
    .from("pending_line_links")
    .update({
      matched_customer_id: params.customerId,
      matched_at: new Date().toISOString(),
      matched_by_user_id: staffUserId,
    })
    .eq("id", params.pendingId);

  // 古い line_messages の customer_id を埋め直す (チャット履歴を顧客
  // タイムラインに正しく出すため)
  await supabase
    .from("line_messages")
    .update({ customer_id: params.customerId })
    .eq("line_user_id", lineUserId)
    .is("customer_id", null);

  revalidatePath("/line-link-queue");
  revalidatePath(`/customer/${params.customerId}`);
  revalidatePath("/line-chat");
  return { success: true };
}

/**
 * 保留行を「該当顧客なし」として破棄する。
 */
export async function dismissPendingLineLink(params: {
  pendingId: number;
  reason?: string;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const activeShopId = await getActiveShopId();

  const { data: pending } = await supabase
    .from("pending_line_links")
    .select("id, shop_id, matched_customer_id, dismissed_at")
    .eq("id", params.pendingId)
    .maybeSingle();
  if (!pending) return { error: "対象の保留行が見つかりません" };
  if ((pending.shop_id as number) !== activeShopId) {
    return { error: "店舗が一致しません" };
  }
  if (pending.matched_customer_id) {
    return { error: "既にマッチ済みの行は破棄できません" };
  }
  if (pending.dismissed_at) {
    return { error: "既に破棄されています" };
  }

  const staffUserId = await resolveCurrentStaffUserId(supabase);

  const { error } = await supabase
    .from("pending_line_links")
    .update({
      dismissed_at: new Date().toISOString(),
      dismissed_by_user_id: staffUserId,
      dismissed_reason: params.reason ?? null,
    })
    .eq("id", params.pendingId);
  if (error) return { error: error.message };

  revalidatePath("/line-link-queue");
  return { success: true };
}
