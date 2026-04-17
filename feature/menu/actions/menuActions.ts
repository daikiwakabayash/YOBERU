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
    // plan_type: "" (未選択) は null 扱い、"ticket" / "subscription" のみ有効値。
    plan_type: raw.plan_type === "" || raw.plan_type == null ? null : raw.plan_type,
    // ticket_count: 無ければ null (plan_type='ticket' 以外のとき DB 側は NULL)
    ticket_count:
      raw.ticket_count && String(raw.ticket_count).trim() !== ""
        ? Number(raw.ticket_count)
        : null,
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
    // plan_type: "" (未選択) は null 扱い、"ticket" / "subscription" のみ有効値。
    plan_type: raw.plan_type === "" || raw.plan_type == null ? null : raw.plan_type,
    // ticket_count: 無ければ null (plan_type='ticket' 以外のとき DB 側は NULL)
    ticket_count:
      raw.ticket_count && String(raw.ticket_count).trim() !== ""
        ? Number(raw.ticket_count)
        : null,
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

/**
 * 既存メニューを複製する。料金・施術時間・カテゴリ等はそのまま引き継ぎ、
 * 名前に「（コピー）」を付けて新しい menu_manage_id を採番する。
 * 採番方式は createMenu と同じ (BRD-{id} / STR-{id}、id は最大 + 1)。
 */
export async function copyMenu(
  id: number
): Promise<{ success: true; id: number } | { error: string }> {
  const supabase = await createClient();

  // 1. コピー元を取得
  const { data: original, error: fetchErr } = await supabase
    .from("menus")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !original) {
    return { error: "コピー元のメニューが見つかりません" };
  }

  // 2. 新しい menu_manage_id を採番
  const prefix = original.menu_type === 0 ? "BRD" : "STR";
  const { data: lastMenu } = await supabase
    .from("menus")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single();
  const nextId = (lastMenu?.id ?? 0) + 1;
  const newMenuManageId = `${prefix}-${nextId}`;

  // 3. クローン用オブジェクト (id / created_at / updated_at は除外)
  const clone = {
    brand_id: original.brand_id,
    shop_id: original.shop_id,
    category_id: original.category_id,
    menu_type: original.menu_type,
    name: `${original.name}（コピー）`.slice(0, 255),
    price: original.price,
    price_disp_type: original.price_disp_type,
    duration: original.duration,
    image_url: original.image_url,
    available_count: original.available_count,
    status: original.status,
    sort_number: original.sort_number,
    menu_manage_id: newMenuManageId,
  };

  // 4. INSERT → 新 id を取得
  const { data: inserted, error: insertErr } = await supabase
    .from("menus")
    .insert(clone)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { error: insertErr?.message ?? "コピーに失敗しました" };
  }

  revalidatePath("/menu");
  revalidatePath("/reservation");
  revalidatePath("/booking-link");
  return { success: true, id: inserted.id as number };
}
