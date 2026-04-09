"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Get today's appointments for reception processing
 */
export async function getTodayAppointments(shopId: number, date: string) {
  const supabase = await createClient();
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, customers(id, code, last_name, first_name, phone_number_1), staffs(id, name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null)
    .order("start_at");

  if (error) throw error;
  return data ?? [];
}
