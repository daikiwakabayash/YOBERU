"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * code は creative_symptoms の PK (VARCHAR 32) で、booking_links.symptom
 * からの FK 参照先になる。UI から新規追加するときは "c-" + 短いランダム
 * 文字列で自動採番する (人間は name と sort_number だけ気にすれば良い)。
 */
function generateCode(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `c-${rand}`;
}

export async function createCreativeSymptom(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const insert = {
    code: generateCode(),
    name: String(raw.name ?? "新規症状"),
    sort_number: Number(raw.sort_number ?? 0),
  };

  const { error } = await supabase.from("creative_symptoms").insert(insert);
  if (error) return { error: error.message };
  revalidatePath("/creative-symptom");
  revalidatePath("/booking-link");
  revalidatePath("/marketing");
  return { success: true };
}

export async function updateCreativeSymptom(
  code: string,
  formData: FormData
) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const update: Record<string, unknown> = {};
  if (raw.name !== undefined) update.name = String(raw.name);
  if (raw.sort_number !== undefined)
    update.sort_number = Number(raw.sort_number);

  const { error } = await supabase
    .from("creative_symptoms")
    .update(update)
    .eq("code", code);
  if (error) return { error: error.message };
  revalidatePath("/creative-symptom");
  revalidatePath("/booking-link");
  revalidatePath("/marketing");
  return { success: true };
}

export async function deleteCreativeSymptom(code: string) {
  const supabase = await createClient();
  // 物理削除ではなくソフトデリート。既存 booking_links.symptom = code の
  // 参照を壊さないようにするため (FK は残るがプルダウンからは消える)。
  const { error } = await supabase
    .from("creative_symptoms")
    .update({ deleted_at: new Date().toISOString() })
    .eq("code", code);
  if (error) return { error: error.message };
  revalidatePath("/creative-symptom");
  revalidatePath("/booking-link");
  revalidatePath("/marketing");
  return { success: true };
}
