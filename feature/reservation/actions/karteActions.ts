"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * カルテ本文 (appointments.customer_record) を後から編集する。
 *
 * 会計確定済み / 未確定に関わらず呼べる。呼び出しごとに:
 *   - customer_record を上書き
 *   - customer_record_updated_at を NOW() に
 *   - customer_record_updated_by を現在ログインしているユーザーの
 *     メールアドレスに
 *
 * 誰が編集したかを後から追えるようメタを同テーブル上に残す (別テーブル
 * 化は将来の拡張候補)。migration 00029 のカラムが未適用の環境では
 * カラム欠落エラーを検知して "監査情報なし" で上書きだけを試みる
 * フォールバックを入れてある。
 */
export async function updateAppointmentKarte(
  appointmentId: number,
  customerRecord: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();

  // 編集者のメアド取得 (Supabase Auth)
  let editorEmail: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    editorEmail = data?.user?.email ?? null;
  } catch {
    /* auth 解決失敗でも編集自体は通す */
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("appointments")
    .update({
      customer_record: customerRecord,
      customer_record_updated_at: nowIso,
      customer_record_updated_by: editorEmail,
    })
    .eq("id", appointmentId);

  if (error) {
    // migration 00029 未適用 → 監査カラム無しで再試行
    if (
      error.message.includes("customer_record_updated_at") ||
      error.message.includes("customer_record_updated_by")
    ) {
      const retry = await supabase
        .from("appointments")
        .update({ customer_record: customerRecord })
        .eq("id", appointmentId);
      if (retry.error) return { error: retry.error.message };
      // 監査情報を残せないことは呼び出し側にサイレントに伝えず成功扱い
      // にする (本文の編集自体は成功しているため)。
    } else {
      return { error: error.message };
    }
  }

  revalidatePath("/customer");
  revalidatePath("/reservation");
  return { success: true };
}
