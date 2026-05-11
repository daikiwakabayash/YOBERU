"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * 完了 (status=2) した予約の会計確定を取り消し、副作用を 1 セットで戻す。
 *
 * 戻す副作用:
 *   1. status: 2 → 1 (来院中) に戻す
 *   2. customers.visit_count を 1 減らす (継続決済予約は visit_count を
 *      増やしていないので触らない)
 *   3. customers.last_visit_date を「直前の他の完了予約の start_at 日付」
 *      に巻き戻し。他に完了予約が無ければ NULL クリア
 *   4. consumed_plan_id がある場合:
 *        - customer_plans.used_count を 1 減らす
 *        - 旧 used_count == total_count で status=1 (使い切り) に
 *          なっていたなら status=0 に戻す
 *        - appointments.consumed_plan_id / consumed_amount を NULL クリア
 *   5. is_member_join のロールバックは行わない (= 入会した事実は残す)。
 *      不要なら 「更新」 で off にしてもらう。
 *   6. 継続決済予約 (is_continued_billing=TRUE) の取消しは想定外として
 *      エラーを返す (resetSubscriptionForRenewal で next_billing_date を
 *      動かしているため、巻き戻しは別途要設計)
 *   7. appointment_logs に operation_type=5 (UNCOMPLETE) で記録
 *
 * これで「会計を取り消す」→ ユーザが正しく直して再度「会計を確定する」、
 * の流れで安全にミスを修正できる。
 */
export async function uncompleteAppointment(
  id: number
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();

  // 1. 対象予約を取得し、状態を検証
  const { data: appt, error: fetchErr } = await supabase
    .from("appointments")
    .select(
      "id, customer_id, status, start_at, is_continued_billing, consumed_plan_id, consumed_amount, sales"
    )
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !appt) {
    return { error: fetchErr?.message ?? "予約が見つかりません" };
  }
  if (appt.status !== 2) {
    return { error: "完了している予約のみ取り消せます" };
  }
  if (appt.is_continued_billing) {
    return {
      error:
        "継続決済予約の取消はサブスクの請求月リセットに関わるため、" +
        "別途お問い合わせください",
    };
  }

  // 2. プラン消化を巻き戻す
  if (appt.consumed_plan_id) {
    const { data: plan } = await supabase
      .from("customer_plans")
      .select("id, used_count, total_count, status")
      .eq("id", appt.consumed_plan_id as number)
      .maybeSingle();
    if (plan) {
      const prevUsed = (plan.used_count as number | null) ?? 0;
      const nextUsed = Math.max(0, prevUsed - 1);
      // 使い切り (status=1) で締まっていたなら active (0) に戻す
      const wasExhausted = plan.status === 1;
      await supabase
        .from("customer_plans")
        .update({
          used_count: nextUsed,
          status: wasExhausted ? 0 : (plan.status as number),
        })
        .eq("id", plan.id);
    }
  }

  // 3. 予約 status と消化情報をクリア
  const { error: updErr } = await supabase
    .from("appointments")
    .update({
      status: 1, // 完了 → 来院中 に戻す (会計し直しの導線に乗せる)
      consumed_plan_id: null,
      consumed_amount: 0,
    })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  // 4. customer.visit_count / last_visit_date を巻き戻し
  if (appt.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, visit_count")
      .eq("id", appt.customer_id as number)
      .maybeSingle();
    const prevCount = (cust?.visit_count as number | null) ?? 0;
    const nextCount = Math.max(0, prevCount - 1);

    // last_visit_date を「自分以外の他の完了予約の最新日付」にロールバック
    const { data: otherCompleted } = await supabase
      .from("appointments")
      .select("start_at")
      .eq("customer_id", appt.customer_id as number)
      .eq("status", 2)
      .neq("id", id)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newLast = otherCompleted?.start_at
      ? (otherCompleted.start_at as string).slice(0, 10)
      : null;
    await supabase
      .from("customers")
      .update({
        visit_count: nextCount,
        last_visit_date: newLast,
      })
      .eq("id", appt.customer_id as number);
  }

  // 5. 監査ログ
  await supabase.from("appointment_logs").insert({
    appointment_id: id,
    operation_type: 5, // UNCOMPLETE
    actor_type: 1, // STAFF
    diff: {
      before: { status: 2, sales: appt.sales },
      after: { status: 1, consumed_plan_id_cleared: !!appt.consumed_plan_id },
    },
  });

  revalidatePath("/reservation");
  revalidatePath("/reception");
  revalidatePath("/sales");
  revalidatePath("/customer");
  revalidatePath("/marketing");
  return { success: true };
}
