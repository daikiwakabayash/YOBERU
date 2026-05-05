"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/helper/lib/supabase/server";

/**
 * 顧客自身が自分の予約をキャンセルする。
 *
 * 認証は line_user_id を使う (LIFF 経由でログイン情報を取得)。
 * トークンが一致しない / 締切を過ぎている / 店舗設定で禁止 等の場合は
 * 拒否する (二重チェック)。
 *
 * 内部的には appointments.status = 3 (キャンセル) に更新。
 */
export async function cancelOwnBooking(params: {
  lineUserId: string;
  appointmentId: number;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, shop_id")
    .eq("line_user_id", params.lineUserId)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!customer) return { error: "顧客情報が見つかりません" };

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, customer_id, status, start_at, shop_id")
    .eq("id", params.appointmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!appointment) return { error: "予約が見つかりません" };
  if (appointment.customer_id !== customer.id) {
    return { error: "この予約はキャンセル権限がありません" };
  }
  if (appointment.status !== 0 && appointment.status !== 1) {
    return { error: "この予約は既にキャンセル済 / 完了しています" };
  }

  const { data: shop } = await supabase
    .from("shops")
    .select(
      "customer_can_cancel, customer_cancel_deadline_hours"
    )
    .eq("id", appointment.shop_id as number)
    .maybeSingle();
  if (!shop) return { error: "店舗設定が取得できません" };
  if (!(shop.customer_can_cancel as boolean | undefined)) {
    return {
      error: "この店舗ではキャンセル機能が無効です。店舗にお問い合わせください。",
    };
  }

  const deadlineH =
    (shop.customer_cancel_deadline_hours as number | undefined) ?? 24;
  const startMs = new Date(appointment.start_at as string).getTime();
  const hoursUntil = (startMs - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil < deadlineH) {
    return {
      error: `キャンセル可能な締切 (予約開始の ${deadlineH} 時間前) を過ぎています。店舗にお問い合わせください。`,
    };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      status: 3,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.appointmentId);
  if (error) return { error: error.message };

  revalidatePath("/mypage");
  revalidatePath(`/customer/${customer.id}`);
  return { success: true };
}
