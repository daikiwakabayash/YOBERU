"use server";

import { createClient } from "@/helper/lib/supabase/server";

export async function getFacilities(shopId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facilities")
    .select("*")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("allocate_order");
  if (error) throw error;
  return data;
}

export async function getFacility(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facilities")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

export async function getFacilityMenus(facilityId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_facilities")
    .select("*, menus:menu_manage_id")
    .eq("facility_id", facilityId);
  if (error) throw error;
  return data;
}
