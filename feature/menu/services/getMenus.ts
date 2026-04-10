"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Fetch all menu categories for a brand.
 *
 * NOTE: menu_categories.shop_id has no FK reference in the schema,
 * so we can't use Supabase implicit joins like `shops(name)`. Instead,
 * we fetch the referenced shops in a second query and map them manually.
 */
export async function getMenuCategories(brandId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number");
  if (error) throw error;
  const rows = data ?? [];

  // Collect unique shop_ids to look up names
  const shopIds = Array.from(
    new Set(
      rows
        .map((r) => r.shop_id as number | null)
        .filter((id): id is number => id != null)
    )
  );
  let shopMap = new Map<number, string>();
  if (shopIds.length > 0) {
    const { data: shops } = await supabase
      .from("shops")
      .select("id, name")
      .in("id", shopIds);
    shopMap = new Map(
      (shops ?? []).map((s: { id: number; name: string }) => [s.id, s.name])
    );
  }

  // Attach shops field for backwards compatibility with existing components
  return rows.map((r) => ({
    ...r,
    shops: r.shop_id
      ? { name: shopMap.get(r.shop_id as number) ?? "店舗限定" }
      : null,
  }));
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

/**
 * Fetch menus for a brand.
 *
 * NOTE: menus.category_id references menu_categories(id) so implicit joins
 * via `menu_categories(name)` DO work, but we fetch separately to be
 * consistent and resilient to FK configuration changes.
 */
export async function getMenus(
  brandId: number,
  filters?: { categoryId?: number }
) {
  const supabase = await createClient();
  let query = supabase
    .from("menus")
    .select("*")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number");

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  // Look up category names
  const categoryIds = Array.from(
    new Set(
      rows
        .map((r) => r.category_id as number | null)
        .filter((id): id is number => id != null)
    )
  );
  let categoryMap = new Map<number, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await supabase
      .from("menu_categories")
      .select("id, name")
      .in("id", categoryIds);
    categoryMap = new Map(
      (categories ?? []).map((c: { id: number; name: string }) => [
        c.id,
        c.name,
      ])
    );
  }

  return rows.map((r) => ({
    ...r,
    menu_categories: r.category_id
      ? { name: categoryMap.get(r.category_id as number) ?? "-" }
      : null,
  }));
}

export async function getMenu(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;

  // Attach category name
  let categoryName: string | null = null;
  if (data?.category_id) {
    const { data: cat } = await supabase
      .from("menu_categories")
      .select("name")
      .eq("id", data.category_id)
      .single();
    categoryName = cat?.name ?? null;
  }
  return { ...data, menu_categories: categoryName ? { name: categoryName } : null };
}
