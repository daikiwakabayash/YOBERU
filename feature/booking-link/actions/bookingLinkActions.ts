"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { bookingLinkSchema } from "../schema/bookingLink.schema";
import { revalidatePath } from "next/cache";

function parseForm(raw: Record<string, FormDataEntryValue>) {
  return bookingLinkSchema.safeParse({
    brand_id: Number(raw.brand_id),
    shop_id: raw.shop_id ? Number(raw.shop_id) : null,
    slug: raw.slug,
    title: raw.title,
    memo: raw.memo || null,
    language: raw.language || "ja",
    menu_manage_ids: raw.menu_manage_ids
      ? JSON.parse(String(raw.menu_manage_ids))
      : [],
    alias_menu_name: raw.alias_menu_name || null,
    staff_mode: Number(raw.staff_mode ?? 0),
    require_cancel_policy: raw.require_cancel_policy === "true",
    cancel_policy_text: raw.cancel_policy_text || null,
    show_line_button: raw.show_line_button === "true",
    line_button_text: raw.line_button_text || null,
    line_button_url: raw.line_button_url || null,
    visit_source_id: raw.visit_source_id ? Number(raw.visit_source_id) : null,
  });
}

export async function createBookingLink(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Convert empty strings to null
  const insertData = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
  );

  try {
    const { error } = await supabase.from("booking_links").insert(insertData);
    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "データベースエラー",
    };
  }
  revalidatePath("/booking-link");
  return { success: true };
}

export async function updateBookingLink(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const updateData = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
  );

  const { error } = await supabase
    .from("booking_links")
    .update(updateData)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booking-link");
  revalidatePath(`/booking-link/${id}`);
  return { success: true };
}

export async function deleteBookingLink(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_links")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booking-link");
  return { success: true };
}

/**
 * Public: create appointment from public booking form
 */
export async function submitPublicBooking(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const slug = String(raw.slug);

  // Lookup booking link (may fail if table missing)
  let link;
  try {
    link = await supabase
      .from("booking_links")
      .select("*")
      .eq("slug", slug)
      .is("deleted_at", null)
      .single();
  } catch (err) {
    return {
      error:
        err instanceof Error && err.message.includes("does not exist")
          ? "データベースのセットアップが必要です"
          : "予約リンクの読み込みに失敗しました",
    };
  }
  if (link.error || !link.data) {
    return { error: "予約リンクが無効です" };
  }

  const brandId = link.data.brand_id as number;
  const shopId = Number(raw.shop_id || link.data.shop_id);
  const menuManageId = String(raw.menu_manage_id);
  const staffId = raw.staff_id ? Number(raw.staff_id) : null;
  const startAt = String(raw.start_at); // "YYYY-MM-DDTHH:MM:00"
  const endAt = String(raw.end_at);
  const lastName = String(raw.last_name || "");
  const firstName = String(raw.first_name || "");
  const phone = String(raw.phone || "");
  const email = String(raw.email || "") || null;
  const utmSource = String(raw.utm_source || "") || null;

  if (!shopId || !menuManageId || !startAt || !endAt || !lastName || !phone) {
    return { error: "必須項目が入力されていません" };
  }

  // 1. Create or find customer by phone
  let customerId: number;
  const existing = await supabase
    .from("customers")
    .select("id")
    .eq("shop_id", shopId)
    .eq("phone_number_1", phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing.data) {
    customerId = existing.data.id as number;
  } else {
    // Generate code
    const maxRow = await supabase
      .from("customers")
      .select("code")
      .eq("shop_id", shopId)
      .order("code", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextCode = "00000001";
    if (maxRow.data?.code) {
      const num = parseInt(String(maxRow.data.code), 10);
      if (!isNaN(num)) nextCode = String(num + 1).padStart(8, "0");
    }

    const inserted = await supabase
      .from("customers")
      .insert({
        brand_id: brandId,
        shop_id: shopId,
        code: nextCode,
        last_name: lastName,
        first_name: firstName || null,
        phone_number_1: phone,
        email,
        type: 0,
        gender: 0,
        first_visit_source_id: link.data.visit_source_id ?? null,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      return { error: "顧客登録に失敗しました: " + inserted.error?.message };
    }
    customerId = inserted.data.id as number;
  }

  // 2. Create appointment
  const code = `APT-${shopId}-${Date.now()}`;
  const apptInsert = await supabase.from("appointments").insert({
    brand_id: brandId,
    shop_id: shopId,
    customer_id: customerId,
    staff_id: staffId ?? 1, // Default to first staff if not assignable
    menu_manage_id: menuManageId,
    code,
    type: 0,
    start_at: startAt,
    end_at: endAt,
    is_couple: false,
    sales: 0,
    status: 0,
    visit_source_id: link.data.visit_source_id ?? null,
    memo: utmSource ? `流入元: ${utmSource}` : null,
  });

  if (apptInsert.error) {
    return { error: "予約作成に失敗しました: " + apptInsert.error.message };
  }

  revalidatePath("/reservation");
  return { success: true };
}
