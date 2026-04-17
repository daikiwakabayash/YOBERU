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
 *
 * Same-day cancellation (`sameDayCancelAppointment`, status = 4) and
 * generic cancellation (`cancelAppointment`, status = 3) intentionally
 * skip this so a no-show is never counted as a real visit.
 *
 * **Continued billing (is_continued_billing = TRUE)** もスキップ対象。
 * サブスクの月額課金だけ売上計上する "幽霊予約" なので、来院回数にも
 * チケット消化にもカウントしない (= last_visit_date も動かさない)。
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

  // Bump the customer's cumulative visit_count + last_visit_date.
  // Wrapped so any failure here never blocks the completion itself.
  try {
    const { data: appt } = await supabase
      .from("appointments")
      .select("customer_id, start_at, is_continued_billing")
      .eq("id", id)
      .maybeSingle();
    // 継続決済 (サブスクの月次課金だけ反映する "幽霊予約") は
    // 来院扱いにしない。visit_count / last_visit_date は据置。
    if (appt?.customer_id && !appt.is_continued_billing) {
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
    }
  } catch (e) {
    console.error("[completeAppointment] failed to bump visit_count", e);
  }

  revalidatePath("/reception");
  revalidatePath("/sales");
  return { success: true };
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
