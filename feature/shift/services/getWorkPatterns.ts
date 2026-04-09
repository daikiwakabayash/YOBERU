"use server";

import { createClient } from "@/helper/lib/supabase/server";

export async function getWorkPatterns(shopId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_patterns")
    .select("*")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("start_time");
  if (error) throw error;
  return data;
}

export async function getWorkPattern(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_patterns")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}
