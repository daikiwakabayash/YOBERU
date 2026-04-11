"use server";
import { createClient } from "@/helper/lib/supabase/server";
import { storeSchema } from "../schema/store.schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createStore(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = storeSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    area_id: Number(raw.area_id),
    user_id: Number(raw.user_id),
    frame_min: Number(raw.frame_min),
    scale: Number(raw.scale),
    sort_number: Number(raw.sort_number || 0),
    is_public: raw.is_public === "true",
    enable_meeting_booking: raw.enable_meeting_booking !== "false",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.from("shops").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/store");
  redirect("/store");
}

export async function updateStore(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = storeSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    area_id: Number(raw.area_id),
    user_id: Number(raw.user_id),
    frame_min: Number(raw.frame_min),
    scale: Number(raw.scale),
    sort_number: Number(raw.sort_number || 0),
    is_public: raw.is_public === "true",
    enable_meeting_booking: raw.enable_meeting_booking !== "false",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("shops")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/store");
  revalidatePath(`/store/${id}`);
  redirect("/store");
}

export async function deleteStore(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shops")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/store");
}
