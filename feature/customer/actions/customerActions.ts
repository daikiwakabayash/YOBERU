"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { customerSchema } from "../schema/customer.schema";
import { revalidatePath } from "next/cache";

export async function createCustomer(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = customerSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    type: Number(raw.type ?? 0),
    gender: Number(raw.gender ?? 0),
    staff_id: raw.staff_id ? Number(raw.staff_id) : null,
    customer_tag_id: raw.customer_tag_id ? Number(raw.customer_tag_id) : null,
    is_send_dm: raw.is_send_dm === "true",
    is_send_mail: raw.is_send_mail === "true",
    is_send_line: raw.is_send_line === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Auto-generate customer code: query max code and pad to 8 digits
  const shopId = parsed.data.shop_id;
  const { data: maxRow } = await supabase
    .from("customers")
    .select("code")
    .eq("shop_id", shopId)
    .order("code", { ascending: false })
    .limit(1)
    .single();

  let nextCode = "00000001";
  if (maxRow?.code) {
    const num = parseInt(maxRow.code, 10);
    if (!isNaN(num)) {
      nextCode = String(num + 1).padStart(8, "0");
    }
  }

  // Convert empty strings to null for DB compatibility
  const cleanedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    cleanedData[key] = value === "" ? null : value;
  }

  const insertData: Record<string, unknown> = {
    ...cleanedData,
    code: nextCode,
  };

  const { error } = await supabase.from("customers").insert(insertData);
  if (error) return { error: error.message };

  revalidatePath("/customer");
  return { success: true };
}

export async function updateCustomer(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = customerSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    type: Number(raw.type ?? 0),
    gender: Number(raw.gender ?? 0),
    staff_id: raw.staff_id ? Number(raw.staff_id) : null,
    customer_tag_id: raw.customer_tag_id ? Number(raw.customer_tag_id) : null,
    is_send_dm: raw.is_send_dm === "true",
    is_send_mail: raw.is_send_mail === "true",
    is_send_line: raw.is_send_line === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Convert empty strings to null for DB compatibility
  const cleanedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    cleanedData[key] = value === "" ? null : value;
  }

  const { error } = await supabase
    .from("customers")
    .update(cleanedData)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/customer");
  revalidatePath(`/customer/${id}`);
  return { success: true };
}

export async function deleteCustomer(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customer");
  return { success: true };
}

/**
 * Read the G口コミ / H口コミ receipt status for one customer.
 *
 * Used by AppointmentDetailSheet to pre-fill the checkboxes the FIRST
 * time the sheet is opened for a customer — the state then persists
 * across future visits because it's stored on `customers`, not on
 * individual appointments.
 *
 * Returns `null` if the column doesn't exist yet (migration 00009 not
 * run) so callers can fail safe.
 */
export async function getCustomerReviewStatus(customerId: number): Promise<{
  hasGoogleReview: boolean;
  hasHotpepperReview: boolean;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("google_review_received_at, hotpepper_review_received_at")
    .eq("id", customerId)
    .maybeSingle();
  if (error) {
    // Most common cause: migration 00009 hasn't been applied. Surface
    // null instead of throwing so the UI still renders.
    console.error("[getCustomerReviewStatus]", error);
    return null;
  }
  return {
    hasGoogleReview: !!data?.google_review_received_at,
    hasHotpepperReview: !!data?.hotpepper_review_received_at,
  };
}

/**
 * Persist whether this customer has given us a Google / HotPepper
 * review. `true` writes NOW() to the column, `false` clears it.
 *
 * Idempotent — the caller can toggle the checkbox any number of times
 * and we'll never double-count in the KPI dashboard (it's a presence
 * check, not a count of toggles).
 */
export async function setCustomerReviewStatus(
  customerId: number,
  params: { google?: boolean; hotpepper?: boolean }
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const patch: Record<string, string | null> = {};
  if (params.google !== undefined) {
    patch.google_review_received_at = params.google
      ? new Date().toISOString()
      : null;
  }
  if (params.hotpepper !== undefined) {
    patch.hotpepper_review_received_at = params.hotpepper
      ? new Date().toISOString()
      : null;
  }
  if (Object.keys(patch).length === 0) return { success: true };

  const { error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", customerId);
  if (error) return { error: error.message };

  revalidatePath("/reservation");
  revalidatePath("/kpi");
  return { success: true };
}
