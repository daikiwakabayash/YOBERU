"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/helper/lib/supabase/server";

export interface LinkLineUserResult {
  success?: true;
  error?: string;
  customerId?: number;
  /**
   * 既存の紐付け (同じ LINE userId が別顧客についている、あるいは
   * 当該顧客に別の LINE userId が付いている) が見つかったため、
   * 上書き確認が必要なケース。UI 側はこの情報を見て顧客に
   * 「本当に切り替えますか？」を提示し、force=true で再実行する。
   *
   * 既存紐付け顧客の個人情報は最小限 (略称) に絞る。マイページ
   * (未認証アクセス) でフルネームを露出させないため。
   */
  requiresConfirmation?: {
    reason: "customer_has_other_line" | "line_taken_by_other_customer";
    /** 例: "ヤマ◯ 太◯" のような masked name */
    maskedExistingName: string;
  };
}

function maskName(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 1) return s;
  return s[0] + "◯".repeat(Math.max(1, s.length - 1));
}

/**
 * line_link_token 付きの URL から、LIFF で取得した line_user_id を顧客に
 * 紐付ける。
 *
 * 仕様変更 (誤紐付け事故防止):
 *   - 以前は「同じ LINE userId が他顧客に紐付いていれば黙って上書き」
 *     していたが、家族間の LINE 共用や、別の顧客が誤って同じ URL を
 *     踏んだ場合に正しい紐付けが消えるリスクがあったため廃止。
 *   - 既存紐付けがある場合は requiresConfirmation を返して、UI に
 *     確認を委ねる。利用者が「上書きする」を押すと force=true で
 *     再実行され、その場合のみ上書きする。
 */
export async function linkLineUserToCustomer(params: {
  token: string;
  lineUserId: string;
  displayName?: string | null;
  /** 上書きする場合は true で再要求 (確認ダイアログ後) */
  force?: boolean;
}): Promise<LinkLineUserResult> {
  const supabase = await createClient();
  const { token, lineUserId } = params;

  if (!token || !lineUserId) {
    return { error: "token / lineUserId が未指定です" };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, last_name, first_name, line_user_id")
    .eq("line_link_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) {
    return {
      error:
        "リンクが無効です。店舗で発行された最新のリンクを使用してください。",
    };
  }

  // 既に同じ LINE userId が同じ顧客に紐付いていれば、何もせず成功
  if ((customer.line_user_id as string | null) === lineUserId) {
    return { success: true, customerId: customer.id as number };
  }

  // この顧客に「別の」 LINE userId が既に付いている
  if (customer.line_user_id && !params.force) {
    const masked = `${maskName(customer.last_name as string | null)} ${maskName(customer.first_name as string | null)}`.trim();
    return {
      error:
        "このカルテには既に別の LINE が紐付けられています。本当に切り替えますか？",
      requiresConfirmation: {
        reason: "customer_has_other_line",
        maskedExistingName: masked || "(お客様)",
      },
    };
  }

  // 同じ LINE userId が他の顧客に紐付いていないか
  const { data: conflict } = await supabase
    .from("customers")
    .select("id, last_name, first_name")
    .eq("line_user_id", lineUserId)
    .neq("id", customer.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (conflict && !params.force) {
    const masked = `${maskName(conflict.last_name as string | null)} ${maskName(conflict.first_name as string | null)}`.trim();
    return {
      error:
        "この LINE アカウントは既に別のお客様カルテに紐付けられています。本当に切り替えますか？",
      requiresConfirmation: {
        reason: "line_taken_by_other_customer",
        maskedExistingName: masked || "(別のお客様)",
      },
    };
  }

  // force / 競合なし のいずれかで実際の更新
  if (conflict) {
    await supabase
      .from("customers")
      .update({ line_user_id: null })
      .eq("id", conflict.id as number);
  }

  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: lineUserId })
    .eq("id", customer.id);
  if (error) return { error: error.message };

  // 過去の line_messages (顧客 id が null の inbound) を埋め直す
  await supabase
    .from("line_messages")
    .update({ customer_id: customer.id })
    .eq("line_user_id", lineUserId)
    .is("customer_id", null);

  revalidatePath(`/customer/${customer.id}`);
  return { success: true, customerId: customer.id as number };
}
