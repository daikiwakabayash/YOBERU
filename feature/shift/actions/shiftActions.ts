"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { workPatternSchema } from "../schema/shift.schema";
import { revalidatePath } from "next/cache";

export async function createWorkPattern(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = workPatternSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.from("work_patterns").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/shift-pattern");
  return { success: true };
}

export async function updateWorkPattern(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = workPatternSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("work_patterns")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/shift-pattern");
  return { success: true };
}

export async function deleteWorkPattern(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_patterns")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/shift-pattern");
  return { success: true };
}
