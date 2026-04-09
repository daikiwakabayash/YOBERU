"use server";
import { createClient } from "@/helper/lib/supabase/server";

export async function getStores(brandId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select("*, areas(name)")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number");
  if (error) throw error;
  return data;
}

export async function getStore(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select("*, areas(name)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}
