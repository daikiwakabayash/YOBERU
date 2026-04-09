"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { facilitySchema } from "../schema/facility.schema";
import { revalidatePath } from "next/cache";

export async function createFacility(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = facilitySchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    max_book_count: Number(raw.max_book_count),
    allocate_order: Number(raw.allocate_order || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.from("facilities").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/facility");
  return { success: true };
}

export async function updateFacility(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = facilitySchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    max_book_count: Number(raw.max_book_count),
    allocate_order: Number(raw.allocate_order || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("facilities")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/facility");
  return { success: true };
}

export async function deleteFacility(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("facilities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/facility");
  return { success: true };
}

export async function assignMenuToFacility(
  facilityId: number,
  menuManageId: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_facilities")
    .insert({ facility_id: facilityId, menu_manage_id: menuManageId });
  if (error) return { error: error.message };
  revalidatePath(`/facility/${facilityId}/assignment`);
  return { success: true };
}

export async function removeMenuFromFacility(id: number, facilityId: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("menu_facilities").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/facility/${facilityId}/assignment`);
  return { success: true };
}
