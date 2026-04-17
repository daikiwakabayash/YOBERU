export type PlanType = "ticket" | "subscription";

export interface CustomerPlan {
  id: number;
  brand_id: number;
  shop_id: number;
  customer_id: number;
  menu_manage_id: string;
  menu_name_snapshot: string;
  price_snapshot: number;
  plan_type: PlanType;
  total_count: number | null; // null for subscription
  used_count: number;
  purchased_appointment_id: number | null;
  purchased_at: string;
  next_billing_date: string | null;
  status: number; // 0=active, 1=exhausted/closed, 2=cancelled
  memo: string | null;
}

export interface PlanMenu {
  menu_manage_id: string;
  name: string;
  price: number;
  plan_type: PlanType;
  ticket_count: number | null;
}
