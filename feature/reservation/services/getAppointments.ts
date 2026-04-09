"use server";

import { createClient } from "@/helper/lib/supabase/server";

export async function getAppointments(
  shopId: number,
  startDate: string,
  endDate: string
) {
  const supabase = await createClient();

  // endDate + 1 day for inclusive range
  const endDatePlusOne = new Date(endDate);
  endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, customers(id, code, last_name, first_name, phone_number_1), staffs(id, name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", endDatePlusOne.toISOString().split("T")[0] + "T00:00:00")
    .is("cancelled_at", null)
    .is("deleted_at", null)
    .order("start_at");

  if (error) throw error;
  return data;
}

export async function getAppointment(id: number) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, customers(id, code, last_name, first_name, phone_number_1), staffs(id, name)"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) throw error;
  return data;
}

export async function getCustomerAppointments(
  customerId: number,
  options?: { limit?: number; offset?: number }
) {
  const supabase = await createClient();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const { data, error, count } = await supabase
    .from("appointments")
    .select("*, staffs(name)", { count: "exact" })
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}
