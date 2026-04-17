"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { CustomerPlan, PlanMenu } from "../types";

/**
 * 指定顧客のアクティブなプラン一覧 (サブスクは常に、チケットは残数 > 0
 * のもの) を返す。カルテ表示や会計時の消化対象選択に使う。
 */
export async function getActiveCustomerPlans(
  customerId: number
): Promise<CustomerPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_plans")
    .select(
      "id, brand_id, shop_id, customer_id, menu_manage_id, menu_name_snapshot, price_snapshot, plan_type, total_count, used_count, purchased_appointment_id, purchased_at, next_billing_date, status, memo"
    )
    .eq("customer_id", customerId)
    .eq("status", 0)
    .is("deleted_at", null)
    .order("purchased_at", { ascending: false });
  if (error) {
    console.error("[getActiveCustomerPlans]", error);
    return [];
  }
  return (data ?? []) as CustomerPlan[];
}

/**
 * ブランド/店舗で提案可能なプランメニューを返す。
 * menus.plan_type IS NOT NULL の行だけを対象とする。
 * ブランド共通プラン (shop_id IS NULL) と店舗限定プランの両方を含める。
 */
export async function getPlanMenusForShop(
  brandId: number,
  shopId: number
): Promise<PlanMenu[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .select("menu_manage_id, name, price, plan_type, ticket_count, shop_id")
    .eq("brand_id", brandId)
    .or(`shop_id.eq.${shopId},shop_id.is.null`)
    .not("plan_type", "is", null)
    .eq("status", true)
    .is("deleted_at", null)
    .order("price", { ascending: true });
  if (error) {
    console.error("[getPlanMenusForShop]", error);
    return [];
  }
  return ((data ?? []) as Array<PlanMenu & { shop_id: number | null }>).map(
    (m) => ({
      menu_manage_id: m.menu_manage_id,
      name: m.name,
      price: m.price,
      plan_type: m.plan_type,
      ticket_count: m.ticket_count,
    })
  );
}
