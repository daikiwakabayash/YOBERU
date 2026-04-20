"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { TagTemplate } from "../types";

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message ?? "");
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    (error as { code?: string }).code === "42P01" ||
    (error as { code?: string }).code === "PGRST205"
  );
}

export async function getTagTemplates(
  brandId: number
): Promise<{ data: TagTemplate[]; setupRequired: boolean }> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("tag_templates")
      .select("*")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: false });
    if (error) {
      if (isMissingTableError(error))
        return { data: [], setupRequired: true };
      return { data: [], setupRequired: false };
    }
    return { data: (data ?? []) as TagTemplate[], setupRequired: false };
  } catch (err) {
    if (isMissingTableError(err))
      return { data: [], setupRequired: true };
    return { data: [], setupRequired: false };
  }
}

export async function getTagTemplateById(
  id: number
): Promise<TagTemplate | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("tag_templates")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return data as TagTemplate;
  } catch {
    return null;
  }
}

export async function getTagTemplatesByIds(
  ids: number[]
): Promise<TagTemplate[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("tag_templates")
      .select("*")
      .in("id", ids)
      .is("deleted_at", null);
    if (error || !data) return [];
    return data as TagTemplate[];
  } catch {
    return [];
  }
}
