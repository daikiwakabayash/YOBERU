"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { paymentMethodSchema } from "../schema/paymentMethod.schema";
import { revalidatePath } from "next/cache";

export async function createPaymentMethod(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = paymentMethodSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    sort_number: Number(raw.sort_number ?? 0),
    is_active: raw.is_active === "true" || raw.is_active === "on",
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("payment_methods").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/payment-method");
  return { success: true };
}

export async function updatePaymentMethod(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = paymentMethodSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    sort_number: Number(raw.sort_number ?? 0),
    is_active: raw.is_active === "true" || raw.is_active === "on",
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("payment_methods")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/payment-method");
  return { success: true };
}

export async function deletePaymentMethod(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("payment_methods")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/payment-method");
  return { success: true };
}
