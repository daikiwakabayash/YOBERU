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

/** Supabase の生エラーメッセージを運用者向けの説明文に置き換える。 */
function translateError(msg: string): string {
  if (msg.includes("row-level security") || msg.includes("row level security")) {
    return (
      "tag_templates テーブルの Row Level Security が有効です。" +
      "Supabase の SQL Editor で次を実行してください: " +
      "ALTER TABLE tag_templates DISABLE ROW LEVEL SECURITY;"
    );
  }
  if (
    msg.includes("tag_templates") &&
    (msg.includes("does not exist") || msg.includes("schema cache"))
  ) {
    return (
      "tag_templates テーブルが未作成です。Supabase の SQL Editor で " +
      "supabase/migrations/00023_tag_templates.sql を実行してください。"
    );
  }
  return msg;
}

export async function createTagTemplate(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const { error } = await supabase.from("tag_templates").insert(parsed.data);
  if (error) return { error: translateError(error.message) };
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
  if (error) return { error: translateError(error.message) };
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
  if (error) return { error: translateError(error.message) };
  revalidatePath("/tag-template");
  return { success: true };
}
