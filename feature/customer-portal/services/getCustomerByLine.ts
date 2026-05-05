"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface CustomerSelfServiceContext {
  customerId: number;
  customerName: string;
  shopId: number;
  shopName: string;
  customerCanCancel: boolean;
  customerCanModify: boolean;
  customerCancelDeadlineHours: number;
}

export interface CustomerAppointmentRow {
  id: number;
  startAt: string;
  endAt: string;
  status: number;
  staffName: string | null;
  menuName: string | null;
  /** 当該予約がキャンセル可能か (店舗設定 + 締切判定で算出) */
  canCancel: boolean;
  /** 締切までの残り時間 (h) — 表示用 */
  hoursUntilStart: number;
}

/**
 * line_user_id から顧客を引き、店舗のセルフサービス設定を返す。
 */
export async function getCustomerByLine(
  lineUserId: string
): Promise<CustomerSelfServiceContext | null> {
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, last_name, first_name, shop_id")
    .eq("line_user_id", lineUserId)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!customer) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select(
      "id, name, customer_can_cancel, customer_can_modify, customer_cancel_deadline_hours"
    )
    .eq("id", customer.shop_id as number)
    .maybeSingle();
  if (!shop) return null;

  return {
    customerId: customer.id as number,
    customerName:
      [customer.last_name, customer.first_name].filter(Boolean).join(" ") ||
      "お客様",
    shopId: shop.id as number,
    shopName: shop.name as string,
    customerCanCancel:
      (shop.customer_can_cancel as boolean | undefined) ?? true,
    customerCanModify:
      (shop.customer_can_modify as boolean | undefined) ?? false,
    customerCancelDeadlineHours:
      (shop.customer_cancel_deadline_hours as number | undefined) ?? 24,
  };
}

/**
 * 当該顧客の (今後の) 予約一覧を返す。
 * canCancel は店舗設定 + 開始時刻までの残時間で判定する。
 */
export async function getCustomerUpcomingAppointments(params: {
  customerId: number;
  shopSettings: {
    customerCanCancel: boolean;
    customerCancelDeadlineHours: number;
  };
}): Promise<CustomerAppointmentRow[]> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, start_at, end_at, status, menu_manage_id, staffs(name)"
    )
    .eq("customer_id", params.customerId)
    .is("deleted_at", null)
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(20);
  if (error) return [];

  // メニュー名を別クエリで join (implicit join 回避)
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const menuIds = [
    ...new Set(
      rows
        .map((r) => r.menu_manage_id as string | null)
        .filter((m): m is string => !!m)
    ),
  ];
  const menuMap = new Map<string, string>();
  if (menuIds.length > 0) {
    const { data: menus } = await supabase
      .from("menus")
      .select("menu_manage_id, name")
      .in("menu_manage_id", menuIds);
    for (const m of menus ?? []) {
      menuMap.set(m.menu_manage_id as string, m.name as string);
    }
  }

  const now = Date.now();
  return rows.map((r) => {
    const startAt = r.start_at as string;
    const ms = new Date(startAt).getTime() - now;
    const hoursUntilStart = ms / (1000 * 60 * 60);
    const status = r.status as number;
    const isPending = status === 0 || status === 1; // 未キャンセル系
    const canCancel =
      params.shopSettings.customerCanCancel &&
      isPending &&
      hoursUntilStart >= params.shopSettings.customerCancelDeadlineHours;
    const staffs = r.staffs as { name: string } | null;
    return {
      id: r.id as number,
      startAt,
      endAt: r.end_at as string,
      status,
      staffName: staffs?.name ?? null,
      menuName: r.menu_manage_id
        ? menuMap.get(r.menu_manage_id as string) ?? null
        : null,
      canCancel,
      hoursUntilStart,
    };
  });
}
