"use server";

import { createClient } from "@/helper/lib/supabase/server";

export async function getMenuCategories(brandId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*, shops(name)")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number");
  if (error) throw error;
  return data;
}

export async function getMenuCategory(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

export async function getMenus(
  brandId: number,
  filters?: { categoryId?: number }
) {
  const supabase = await createClient();
  let query = supabase
    .from("menus")
    .select("*, menu_categories(name)")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number");

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getMenu(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .select("*, menu_categories(name)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}
