"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { toLocalDateString } from "@/helper/utils/time";

/**
 * Check in a customer (mark as arrived)
 */
export async function checkinAppointment(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: 1 })
    .eq("id", id);
  if (error) return { error: error.message };

  // Log the checkin
  await supabase.from("appointment_logs").insert({
    appointment_id: id,
    operation_type: 4, // CHECKIN
    actor_type: 1, // STAFF
  });

  revalidatePath("/reception");
  return { success: true };
}

/**
 * Complete appointment with sales amount.
 *
 * Side effects (best-effort, never fail the main update):
 *  - Increments customers.visit_count by 1 (skipped for 継続決済)
 *  - Sets customers.last_visit_date to the appointment's start date in
 *    Asia/Tokyo (so the calendar's "新規" badge correctly turns off after
 *    a returning visit, and customer reports show the right last-visit date)
 *  - 会員メニュー (menu.price = 0 かつ plan_type 無し、≒「会員 30分」等) で
 *    完了した場合、顧客のアクティブな customer_plans から 1 回分を自動消化
 *    (consumed_plan_id を紐付け + used_count +1)。これが問い合わせの多い
 *    「残り何回か分からない」問題の根幹対策。
 *  - 継続決済 (is_continued_billing=TRUE) で完了したサブスクプランは
 *    used_count を 0 にリセットし、next_billing_date を 1 ヶ月進める。
 *    = 月次課金が成立したタイミングで「また今月分の回数が使える」状態へ。
 *
 * Same-day cancellation (`sameDayCancelAppointment`, status = 4) と
 * generic cancellation (`cancelAppointment`, status = 3) は
 * 意図的にここを呼ばず、no-show が来院実績としてカウントされない
 * ようになっている。
 */
export async function completeAppointment(id: number, salesAmount: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: 2, sales: salesAmount })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("appointment_logs").insert({
    appointment_id: id,
    operation_type: 2, // UPDATE (completed)
    actor_type: 1,
    diff: { status: 2, sales: salesAmount },
  });

  // Bump the customer's cumulative visit_count + last_visit_date, and
  // auto-consume plan count if applicable.
  // Wrapped so any failure here never blocks the completion itself.
  try {
    const { data: appt } = await supabase
      .from("appointments")
      .select(
        "customer_id, start_at, is_continued_billing, menu_manage_id, consumed_plan_id"
      )
      .eq("id", id)
      .maybeSingle();
    if (!appt?.customer_id) {
      /* slot block or broken row → skip side effects */
    } else if (appt.is_continued_billing) {
      // 継続決済: visit_count は据置。代わりに対象サブスクの used_count を
      // リセットして next_billing_date を 1 ヶ月進める。
      // 対象プラン: appointment.consumed_plan_id に既に紐付いていればそれ、
      // 無ければ顧客の最新 active subscription を探す。
      await resetSubscriptionForRenewal(
        supabase,
        appt.customer_id as number,
        (appt.consumed_plan_id as number | null) ?? null
      );
    } else {
      // 通常来院: visit_count と last_visit_date を更新
      const { data: cust } = await supabase
        .from("customers")
        .select("visit_count")
        .eq("id", appt.customer_id)
        .maybeSingle();
      const nextCount = (cust?.visit_count ?? 0) + 1;
      const lastDate = toLocalDateString(
        appt.start_at ? new Date(appt.start_at as string) : new Date()
      );
      await supabase
        .from("customers")
        .update({
          visit_count: nextCount,
          last_visit_date: lastDate,
        })
        .eq("id", appt.customer_id);

      // 会員メニュー + アクティブプランなら 1 回消化
      if (!appt.consumed_plan_id && appt.menu_manage_id) {
        await autoConsumePlanForAppointment(
          supabase,
          id,
          appt.customer_id as number,
          String(appt.menu_manage_id)
        );
      }
    }
  } catch (e) {
    console.error("[completeAppointment] post-complete side effect failed", e);
  }

  revalidatePath("/reception");
  revalidatePath("/sales");
  revalidatePath("/customer");
  return { success: true };
}

/**
 * 完了した予約が「会員メニュー (=プランで使う無料メニュー)」なら、
 * 顧客のアクティブな customer_plans から 1 回を消化する。
 *
 * 会員メニューの判定:
 *   menus.price = 0 かつ menus.plan_type IS NULL
 *   (plan_type が入っているメニューはプラン "販売用" なので対象外)
 *
 * 消化対象の優先度:
 *   1. 残回数のあるチケット (purchased_at ASC = 古い順に消化)
 *   2. 月あたり回数制限のあるサブスク (used_count < total_count)
 *   3. 無制限サブスク (カウントはしないが consumed_plan_id だけ貼る)
 */
async function autoConsumePlanForAppointment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  appointmentId: number,
  customerId: number,
  menuManageId: string
) {
  const { data: menu } = await supabase
    .from("menus")
    .select("price, plan_type")
    .eq("menu_manage_id", menuManageId)
    .maybeSingle();
  if (!menu) return;
  if (menu.plan_type != null) return; // プラン販売用メニュー本体は対象外
  if ((menu.price as number) !== 0) return; // 有料メニューはプラン消化しない

  const { data: plans } = await supabase
    .from("customer_plans")
    .select("id, plan_type, used_count, total_count, purchased_at")
    .eq("customer_id", customerId)
    .eq("status", 0)
    .is("deleted_at", null)
    .order("purchased_at", { ascending: true });
  if (!plans || plans.length === 0) return;

  const candidate = plans.find(
    (p: {
      plan_type: string;
      used_count: number | null;
      total_count: number | null;
    }) => {
      if (p.plan_type === "ticket") {
        return (
          p.total_count != null && (p.used_count ?? 0) < (p.total_count as number)
        );
      }
      // subscription
      if (p.total_count != null) {
        return (p.used_count ?? 0) < (p.total_count as number);
      }
      return true; // 無制限サブスク
    }
  );
  if (!candidate) return;

  const nextUsed = (candidate.used_count ?? 0) + 1;
  const exhausted =
    candidate.plan_type === "ticket" &&
    candidate.total_count != null &&
    nextUsed >= (candidate.total_count as number);

  await supabase
    .from("appointments")
    .update({ consumed_plan_id: candidate.id })
    .eq("id", appointmentId);
  await supabase
    .from("customer_plans")
    .update({
      used_count: nextUsed,
      status: exhausted ? 1 : 0,
    })
    .eq("id", candidate.id);
}

/**
 * サブスクの月次課金が走った (= 継続決済予約が完了) タイミングで、
 * 対象サブスクプランを「新しい月に入った」状態に遷移させる。
 *   - used_count を 0 にリセット
 *   - next_billing_date を 1 ヶ月進める
 *
 * 対象選択:
 *   - preferredPlanId (appointment.consumed_plan_id) が有効なサブスクなら
 *     それを採用
 *   - 無ければ顧客の最新 active subscription
 */
async function resetSubscriptionForRenewal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  customerId: number,
  preferredPlanId: number | null
) {
  let targetId: number | null = null;

  if (preferredPlanId) {
    const { data: plan } = await supabase
      .from("customer_plans")
      .select("id, plan_type, status, next_billing_date")
      .eq("id", preferredPlanId)
      .maybeSingle();
    if (plan && plan.plan_type === "subscription" && plan.status === 0) {
      targetId = plan.id as number;
    }
  }

  if (!targetId) {
    const { data: subs } = await supabase
      .from("customer_plans")
      .select("id")
      .eq("customer_id", customerId)
      .eq("plan_type", "subscription")
      .eq("status", 0)
      .is("deleted_at", null)
      .order("purchased_at", { ascending: false })
      .limit(1);
    targetId = subs?.[0]?.id ?? null;
  }

  if (!targetId) return;

  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");

  await supabase
    .from("customer_plans")
    .update({
      used_count: 0,
      next_billing_date: `${y}-${m}-${d}`,
    })
    .eq("id", targetId);
}

/**
 * Mark as no-show
 */
export async function noShowAppointment(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: 99 })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("appointment_logs").insert({
    appointment_id: id,
    operation_type: 99, // NO_SHOW
    actor_type: 1,
  });

  revalidatePath("/reception");
  return { success: true };
}
