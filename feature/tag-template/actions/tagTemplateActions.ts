"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { tagTemplateSchema } from "../schema/tagTemplate.schema";

function parseForm(raw: Record<string, FormDataEntryValue>) {
  return tagTemplateSchema.safeParse({
    brand_id: Number(raw.brand_id),
    title: raw.title,
    content: raw.content ?? "",
    memo: raw.memo || null,
    sort_number: raw.sort_number ?? 0,
  });
}

export async function createTagTemplate(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const { error } = await supabase.from("tag_templates").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/tag-template");
  return { success: true };
}

export async function updateTagTemplate(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const updateData: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("tag_templates")
    .update(updateData)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tag-template");
  revalidatePath(`/tag-template/${id}`);
  return { success: true };
}

export async function deleteTagTemplate(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tag_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tag-template");
  return { success: true };
}
