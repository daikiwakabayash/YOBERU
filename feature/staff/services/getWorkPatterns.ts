"use server";

import { createClient } from "@/helper/lib/supabase/server";

export async function getWorkPatterns(shopId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_patterns")
    .select("id, name, abbreviation_name, start_time, end_time")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return data;
}
