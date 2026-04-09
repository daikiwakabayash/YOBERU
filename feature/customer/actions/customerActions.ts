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

  const insertData: Record<string, unknown> = {
    ...parsed.data,
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

  const { error } = await supabase
    .from("customers")
    .update(parsed.data)
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
