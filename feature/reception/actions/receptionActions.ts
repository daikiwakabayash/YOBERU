"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
 * Complete appointment with sales amount
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
