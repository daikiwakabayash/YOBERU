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

/**
 * Fetch the customer's most recent past, non-cancelled appointment so we can
 * surface the previous visit's chart (customer_record) on the new-booking
 * panel for returning customers. Returns null on error or when there is no
 * prior visit.
 */
export async function getLastVisitForCustomer(customerId: number) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, start_at, customer_record, menu_manage_id, staffs(name)")
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .is("cancelled_at", null)
      .lt("start_at", new Date().toISOString())
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // Supabase typegen models the FK join as an array even for to-one
    // relations, so cast through unknown to the shape we actually want.
    return data as unknown as {
      id: number;
      start_at: string;
      customer_record: string | null;
      menu_manage_id: string | null;
      staffs: { name: string } | null;
    };
  } catch {
    return null;
  }
}
