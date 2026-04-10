"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { menuCategorySchema, menuSchema } from "../schema/menu.schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Menu Category Actions
// ---------------------------------------------------------------------------

export async function createMenuCategory(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = menuCategorySchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: raw.shop_id ? Number(raw.shop_id) : null,
    sort_number: Number(raw.sort_number || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("menu_categories")
    .insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/menu-category");
  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  redirect("/menu-category");
}

export async function updateMenuCategory(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = menuCategorySchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: raw.shop_id ? Number(raw.shop_id) : null,
    sort_number: Number(raw.sort_number || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("menu_categories")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/menu-category");
  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  redirect("/menu-category");
}

export async function deleteMenuCategory(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/menu-category");
  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Menu Actions
// ---------------------------------------------------------------------------

export async function createMenu(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = menuSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: raw.shop_id ? Number(raw.shop_id) : null,
    category_id: Number(raw.category_id),
    menu_type: Number(raw.menu_type || 0),
    price: Number(raw.price || 0),
    price_disp_type: raw.price_disp_type === "true",
    duration: Number(raw.duration),
    available_count: raw.available_count ? Number(raw.available_count) : undefined,
    status: raw.status === "true",
    sort_number: Number(raw.sort_number || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Generate menu_manage_id: BRD-{id} for brand-wide, STR-{id} for shop-specific
  const prefix = parsed.data.menu_type === 0 ? "BRD" : "STR";

  // Fetch next sequential id
  const { data: lastMenu } = await supabase
    .from("menus")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  const nextId = (lastMenu?.id ?? 0) + 1;
  const menuManageId = `${prefix}-${nextId}`;

  const { error } = await supabase
    .from("menus")
    .insert({ ...parsed.data, menu_manage_id: menuManageId });
  if (error) return { error: error.message };

  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  redirect("/menu");
}

export async function updateMenu(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = menuSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: raw.shop_id ? Number(raw.shop_id) : null,
    category_id: Number(raw.category_id),
    menu_type: Number(raw.menu_type || 0),
    price: Number(raw.price || 0),
    price_disp_type: raw.price_disp_type === "true",
    duration: Number(raw.duration),
    available_count: raw.available_count ? Number(raw.available_count) : undefined,
    status: raw.status === "true",
    sort_number: Number(raw.sort_number || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("menus")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  redirect("/menu");
}

export async function deleteMenu(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("menus")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  return { success: true };
}
