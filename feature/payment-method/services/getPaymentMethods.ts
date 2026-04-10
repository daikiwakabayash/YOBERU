"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { PaymentMethod } from "../types";

export async function getPaymentMethods(shopId: number): Promise<PaymentMethod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_number");
  if (error) {
    // Fallback: if table doesn't exist yet, return default list
    return [
      {
        id: 1,
        brand_id: 1,
        shop_id: shopId,
        code: "cash",
        name: "現金",
        sort_number: 1,
        is_active: true,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
      {
        id: 2,
        brand_id: 1,
        shop_id: shopId,
        code: "credit",
        name: "クレジット",
        sort_number: 2,
        is_active: true,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
      {
        id: 3,
        brand_id: 1,
        shop_id: shopId,
        code: "paypay",
        name: "PayPay",
        sort_number: 3,
        is_active: true,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
    ];
  }
  return (data ?? []) as PaymentMethod[];
}
