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

  // Calculate week range (Mon-Sun)
  const baseDateObj = new Date(baseDate + "T00:00:00");
  const weekDateObjs = getWeekDates(baseDateObj);
  const weekDates = weekDateObjs.map((d) => toLocalDateString(d));
  const weekStart = weekDates[0];
  const lastDay = new Date(weekDateObjs[6]);
  lastDay.setDate(lastDay.getDate() + 1);
  const weekEndExclusive = toLocalDateString(lastDay);

  // Build appointments query
  let apptQuery = supabase
    .from("appointments")
    .select(
      "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, customers(last_name, first_name, phone_number_1, visit_count)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${weekStart}T00:00:00`)
    .lt("start_at", `${weekEndExclusive}T00:00:00`)
    .is("cancelled_at", null)
    .is("deleted_at", null)
    .order("start_at");

  if (staffId) {
    apptQuery = apptQuery.eq("staff_id", staffId);
  }

  // Parallel: shop + appointments + staff name
  const [shopRes, apptRes, staffRes] = await Promise.all([
    supabase.from("shops").select("frame_min").eq("id", shopId).single(),
    apptQuery,
    staffId
      ? supabase.from("staffs").select("name").eq("id", staffId).single()
      : Promise.resolve({ data: null }),
  ]);

  const frameMin = shopRes.data?.frame_min ?? 15;
  const appointments = apptRes.data;
  const staffName: string | null = staffRes.data
    ? (staffRes.data as { name: string }).name
    : null;

  // Fetch menus for the found appointments
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

  // Fetch visit sources with colors
  let sourceMap = new Map<
    number,
    { name: string; color: string | null; label_text_color: string | null }
  >();
  try {
    const { data: sources } = await supabase
      .from("visit_sources")
      .select("id, name, color, label_text_color")
      .eq("shop_id", shopId)
      .is("deleted_at", null);
    sourceMap = new Map(
      (sources ?? []).map((s) => [
        s.id as number,
        {
          name: s.name as string,
          color: (s.color as string | null) ?? null,
          label_text_color: (s.label_text_color as string | null) ?? null,
        },
      ])
    );
  } catch {
    // Column may not exist yet
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
    const sourceInfo = a.visit_source_id
      ? sourceMap.get(a.visit_source_id as number)
      : null;
    const menu = menuMap.get(a.menu_manage_id) ?? null;
    // Use the per-appointment snapshot (1 = first visit) — see comment in
    // getCalendarData.ts and 00002 schema.
    const apptVisitCount =
      (a.visit_count as number | null) ?? customer?.visit_count ?? 0;

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
      isNewCustomer: apptVisitCount === 1,
      visitCount: apptVisitCount,
      source: sourceInfo?.name ?? null,
      sourceColor: sourceInfo?.color ?? null,
      sourceTextColor: sourceInfo?.label_text_color ?? null,
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
