"use server";

import { createClient } from "@/helper/lib/supabase/server";

export async function getStaffs(shopId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staffs")
    .select("*")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("allocate_order", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getStaff(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staffs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}
