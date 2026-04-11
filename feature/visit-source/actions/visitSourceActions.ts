"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createVisitSource(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const insert = {
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    name: String(raw.name ?? "新規媒体"),
    color: String(raw.color ?? "#ef4444"),
    label_text_color: String(raw.label_text_color ?? "#ffffff"),
    sort_number: Number(raw.sort_number ?? 0),
    is_active: raw.is_active === "false" ? false : true,
  };

  const { error } = await supabase.from("visit_sources").insert(insert);
  if (error) return { error: error.message };
  revalidatePath("/visit-source");
  revalidatePath("/reservation");
  return { success: true };
}

export async function updateVisitSource(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const update: Record<string, unknown> = {};
  if (raw.name !== undefined) update.name = String(raw.name);
  if (raw.color !== undefined) update.color = String(raw.color);
  if (raw.label_text_color !== undefined)
    update.label_text_color = String(raw.label_text_color);
  if (raw.sort_number !== undefined)
    update.sort_number = Number(raw.sort_number);
  if (raw.is_active !== undefined)
    update.is_active = raw.is_active === "true" || raw.is_active === "on";

  const { error } = await supabase
    .from("visit_sources")
    .update(update)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/visit-source");
  revalidatePath("/reservation");
  return { success: true };
}

export async function deleteVisitSource(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("visit_sources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/visit-source");
  revalidatePath("/reservation");
  return { success: true };
}
