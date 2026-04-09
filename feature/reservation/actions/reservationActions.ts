"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { appointmentSchema } from "../schema/reservation.schema";
import { revalidatePath } from "next/cache";

export async function createAppointment(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = appointmentSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    customer_id: Number(raw.customer_id),
    staff_id: Number(raw.staff_id),
    type: Number(raw.type || 0),
    is_couple: raw.is_couple === "true",
    sales: Number(raw.sales || 0),
    status: Number(raw.status || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Generate unique appointment code
  const code = `APT-${parsed.data.shop_id}-${Date.now()}`;

  const { error } = await supabase.from("appointments").insert({
    ...parsed.data,
    code,
  });

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  return { success: true };
}

export async function updateAppointment(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const updateData: Record<string, unknown> = {};

  // Only update fields that are present in the form
  if (raw.staff_id) updateData.staff_id = Number(raw.staff_id);
  if (raw.menu_manage_id) updateData.menu_manage_id = raw.menu_manage_id;
  if (raw.start_at) updateData.start_at = raw.start_at;
  if (raw.end_at) updateData.end_at = raw.end_at;
  if (raw.memo !== undefined) updateData.memo = raw.memo;
  if (raw.customer_record !== undefined)
    updateData.customer_record = raw.customer_record;
  if (raw.sales !== undefined) updateData.sales = Number(raw.sales);
  if (raw.status !== undefined) updateData.status = Number(raw.status);
  if (raw.visit_source_id)
    updateData.visit_source_id = Number(raw.visit_source_id);
  if (raw.payment_method) updateData.payment_method = raw.payment_method;
  if (raw.additional_charge !== undefined)
    updateData.additional_charge = Number(raw.additional_charge);

  const { error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  revalidatePath(`/reservation/${id}`);
  return { success: true };
}

export async function cancelAppointment(id: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("appointments")
    .update({
      cancelled_at: new Date().toISOString(),
      status: 3,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  return { success: true };
}

export async function deleteAppointment(id: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("appointments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  return { success: true };
}
