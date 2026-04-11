"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { staffSchema } from "../schema/staff.schema";
import { revalidatePath } from "next/cache";

export async function createStaff(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = staffSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    capacity: Number(raw.capacity || 1),
    allocate_order: raw.allocate_order ? Number(raw.allocate_order) : undefined,
    shift_monday: raw.shift_monday ? Number(raw.shift_monday) : null,
    shift_tuesday: raw.shift_tuesday ? Number(raw.shift_tuesday) : null,
    shift_wednesday: raw.shift_wednesday ? Number(raw.shift_wednesday) : null,
    shift_thursday: raw.shift_thursday ? Number(raw.shift_thursday) : null,
    shift_friday: raw.shift_friday ? Number(raw.shift_friday) : null,
    shift_saturday: raw.shift_saturday ? Number(raw.shift_saturday) : null,
    shift_sunday: raw.shift_sunday ? Number(raw.shift_sunday) : null,
    shift_holiday: raw.shift_holiday ? Number(raw.shift_holiday) : null,
    is_public: raw.is_public === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const insertData: Record<string, unknown> = { ...parsed.data };
  if (raw.user_id) {
    insertData.user_id = raw.user_id;
  }

  const { error } = await supabase.from("staffs").insert(insertData);
  if (error) return { error: error.message };

  revalidatePath("/staff");
  return { success: true };
}

export async function updateStaff(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = staffSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    capacity: Number(raw.capacity || 1),
    allocate_order: raw.allocate_order ? Number(raw.allocate_order) : undefined,
    shift_monday: raw.shift_monday ? Number(raw.shift_monday) : null,
    shift_tuesday: raw.shift_tuesday ? Number(raw.shift_tuesday) : null,
    shift_wednesday: raw.shift_wednesday ? Number(raw.shift_wednesday) : null,
    shift_thursday: raw.shift_thursday ? Number(raw.shift_thursday) : null,
    shift_friday: raw.shift_friday ? Number(raw.shift_friday) : null,
    shift_saturday: raw.shift_saturday ? Number(raw.shift_saturday) : null,
    shift_sunday: raw.shift_sunday ? Number(raw.shift_sunday) : null,
    shift_holiday: raw.shift_holiday ? Number(raw.shift_holiday) : null,
    is_public: raw.is_public === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("staffs")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { success: true };
}

export async function deleteStaff(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staffs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { success: true };
}

/**
 * Lightweight action to update only allocate_order (priority for
 * auto-assignment on no-designation bookings). Lower number = higher
 * priority.
 */
export async function updateStaffAllocateOrder(
  id: number,
  allocateOrder: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staffs")
    .update({ allocate_order: allocateOrder })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/staff");
  revalidatePath("/reservation");
  return { success: true };
}
