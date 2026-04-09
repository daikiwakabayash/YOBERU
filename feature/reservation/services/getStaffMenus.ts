"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Get menus a specific staff can perform
 */
export async function getStaffMenus(staffId: number) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff_menus")
    .select("menu_manage_id")
    .eq("staff_id", staffId);

  if (error) throw error;

  if (!data || data.length === 0) return [];

  const menuManageIds = data.map((d) => d.menu_manage_id);

  const { data: menus, error: menuError } = await supabase
    .from("menus")
    .select("id, menu_manage_id, name, price, duration, category_id")
    .in("menu_manage_id", menuManageIds)
    .is("deleted_at", null)
    .eq("status", true)
    .order("sort_number");

  if (menuError) throw menuError;
  return menus ?? [];
}

/**
 * Get staff members who can perform a specific menu
 */
export async function getMenuStaffs(menuManageId: string, shopId: number) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff_menus")
    .select("staff_id")
    .eq("menu_manage_id", menuManageId);

  if (error) throw error;

  if (!data || data.length === 0) return [];

  const staffIds = data.map((d) => d.staff_id);

  const { data: staffs, error: staffError } = await supabase
    .from("staffs")
    .select("id, name, capacity, allocate_order")
    .in("id", staffIds)
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .eq("is_public", true)
    .order("allocate_order", { ascending: true, nullsFirst: false });

  if (staffError) throw staffError;
  return staffs ?? [];
}
