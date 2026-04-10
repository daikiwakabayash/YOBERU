"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { generateTimeSlots, toLocalDateString } from "@/helper/utils/time";
import { getWeekDates } from "@/helper/utils/weekday";
import type { CalendarAppointment } from "../types";

export interface WeeklyCalendarData {
  appointments: CalendarAppointment[];
  timeSlots: string[];
  frameMin: number;
  weekDates: string[]; // ["2026-04-06", "2026-04-07", ..., "2026-04-12"]
  staffName: string | null;
}

/**
 * Fetch calendar data for a full week, optionally filtered by staff.
 */
export async function getWeeklyCalendarData(
  shopId: number,
  baseDate: string,
  staffId?: number | null
): Promise<WeeklyCalendarData> {
  const supabase = await createClient();

  // 1. Get shop settings
  const { data: shop } = await supabase
    .from("shops")
    .select("frame_min")
    .eq("id", shopId)
    .single();

  const frameMin = shop?.frame_min ?? 15;

  // 2. Calculate week range (Mon-Sun)
  const baseDateObj = new Date(baseDate + "T00:00:00");
  const weekDateObjs = getWeekDates(baseDateObj);
  const weekDates = weekDateObjs.map((d) => toLocalDateString(d));
  const weekStart = weekDates[0];
  const lastDay = new Date(weekDateObjs[6]);
  lastDay.setDate(lastDay.getDate() + 1);
  const weekEndExclusive = toLocalDateString(lastDay);

  // 3. Fetch appointments for the week
  let query = supabase
    .from("appointments")
    .select(
      "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, customers(last_name, first_name, phone_number_1, visit_count), visit_sources(name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${weekStart}T00:00:00`)
    .lt("start_at", `${weekEndExclusive}T00:00:00`)
    .is("cancelled_at", null)
    .is("deleted_at", null)
    .order("start_at");

  if (staffId) {
    query = query.eq("staff_id", staffId);
  }

  const { data: appointments } = await query;

  // 4. Fetch menus
  const menuManageIds = [
    ...new Set((appointments ?? []).map((a) => a.menu_manage_id)),
  ];
  let menuMap = new Map<string, { name: string; duration: number }>();
  if (menuManageIds.length > 0) {
    const { data: menus } = await supabase
      .from("menus")
      .select("menu_manage_id, name, duration")
      .in("menu_manage_id", menuManageIds)
      .is("deleted_at", null);
    menuMap = new Map(
      (menus ?? []).map((m) => [
        m.menu_manage_id,
        { name: m.name, duration: m.duration },
      ])
    );
  }

  // 5. Get staff name if filtered
  let staffName: string | null = null;
  if (staffId) {
    const { data: staff } = await supabase
      .from("staffs")
      .select("name")
      .eq("id", staffId)
      .single();
    staffName = staff?.name ?? null;
  }

  // 6. Build appointment list
  const calendarAppointments: CalendarAppointment[] = (
    appointments ?? []
  ).map((a) => {
    const customer = a.customers as unknown as {
      last_name: string | null;
      first_name: string | null;
      phone_number_1: string | null;
      visit_count: number | null;
    } | null;
    const visitSource = a.visit_sources as unknown as { name: string } | null;
    const menu = menuMap.get(a.menu_manage_id) ?? null;
    const customerVisitCount = customer?.visit_count ?? a.visit_count ?? 0;

    return {
      id: a.id,
      staffId: a.staff_id,
      customerId: a.customer_id,
      menuManageId: a.menu_manage_id,
      customerName: customer
        ? `${customer.last_name ?? ""} ${customer.first_name ?? ""}`.trim()
        : "不明",
      customerPhone: customer?.phone_number_1 ?? null,
      menuName: menu?.name ?? "不明",
      startAt: a.start_at,
      endAt: a.end_at,
      status: a.status,
      type: a.type,
      duration: menu?.duration ?? 0,
      memo: a.memo ?? null,
      isNewCustomer: customerVisitCount <= 1,
      visitCount: customerVisitCount,
      source: visitSource?.name ?? null,
      visitSourceId: a.visit_source_id ?? null,
      sales: a.sales ?? 0,
      additionalCharge: a.additional_charge ?? 0,
      paymentMethod: a.payment_method ?? null,
      customerRecord: a.customer_record ?? null,
    };
  });

  // 7. Generate time slots
  const timeSlots = generateTimeSlots(9, 21, frameMin);

  return {
    appointments: calendarAppointments,
    timeSlots,
    frameMin,
    weekDates,
    staffName,
  };
}
