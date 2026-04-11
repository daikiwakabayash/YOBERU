"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * CRUD for slot_block_types (ミーティング / 休憩 / その他 / ユーザー定義).
 * Used by the マスター管理 > 予約ブロック種別 page so shops can add
 * new slot-block categories and tweak colors without a code change.
 */

export async function createSlotBlockType(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  // `code` is the machine-readable key; if the user didn't give us one
  // (most staff won't) we derive it from the timestamp so it's unique.
  const code =
    String(raw.code ?? "").trim() || `custom-${Date.now().toString(36)}`;

  const insert = {
    brand_id: Number(raw.brand_id),
    code,
    label: String(raw.label ?? "新しい種別"),
    color: String(raw.color ?? "#9333ea"),
    label_text_color: String(raw.label_text_color ?? "#ffffff"),
    sort_number: Number(raw.sort_number ?? 0),
    is_active: raw.is_active === "false" ? false : true,
  };

  const { error } = await supabase.from("slot_block_types").insert(insert);
  if (error) return { error: error.message };

  revalidatePath("/slot-block-type");
  revalidatePath("/reservation");
  return { success: true };
}

export async function updateSlotBlockType(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const update: Record<string, unknown> = {};
  if (raw.label !== undefined) update.label = String(raw.label);
  if (raw.color !== undefined) update.color = String(raw.color);
  if (raw.label_text_color !== undefined)
    update.label_text_color = String(raw.label_text_color);
  if (raw.sort_number !== undefined)
    update.sort_number = Number(raw.sort_number);
  if (raw.is_active !== undefined)
    update.is_active = raw.is_active === "true" || raw.is_active === "on";
  // `code` is normally immutable once set, but allow explicit change
  // for advanced users.
  if (raw.code !== undefined && String(raw.code).trim().length > 0)
    update.code = String(raw.code).trim();

  const { error } = await supabase
    .from("slot_block_types")
    .update(update)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/slot-block-type");
  revalidatePath("/reservation");
  return { success: true };
}

export async function deleteSlotBlockType(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("slot_block_types")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/slot-block-type");
  revalidatePath("/reservation");
  return { success: true };
}
