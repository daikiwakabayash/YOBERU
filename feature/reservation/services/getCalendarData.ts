"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { generateTimeSlots, toLocalDateString } from "@/helper/utils/time";
import type { CalendarData, CalendarAppointment } from "../types";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";

/**
 * Aggregation service for the reservation calendar page.
 * Fetches all data needed to render the day-view calendar in one call.
 */
export async function getCalendarData(
  shopId: number,
  date: string
): Promise<CalendarData> {
  const supabase = await createClient();

  // Calculate next day for range query
  const nextDate = new Date(date + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  // Parallel: shop settings + effective shifts + appointments
  const [shopRes, effectiveShifts, apptRes] = await Promise.all([
    supabase.from("shops").select("frame_min").eq("id", shopId).single(),
    getEffectiveShifts(shopId, date).catch(() => []),
    supabase
      .from("appointments")
      .select(
        "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, cancelled_at, is_member_join, customers(last_name, first_name, phone_number_1, visit_count)"
      )
      .eq("shop_id", shopId)
      .gte("start_at", `${date}T00:00:00`)
      .lt("start_at", `${nextDateStr}T00:00:00`)
      // NOTE: cancelled_at is intentionally NOT filtered here so that
      // same-day cancellations and regular cancellations stay visible on
      // the calendar (rendered as a narrow strip on the right edge).
      // checkStaffAvailability still filters cancelled out, so the slot
      // remains free for new bookings.
      .is("deleted_at", null)
      .order("start_at"),
  ]);

  const frameMin = shopRes.data?.frame_min ?? 15;
  const appointments = apptRes.data;

  // Fetch visit sources separately with colors (avoids implicit FK join fragility)
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
    // visit_sources column may not exist yet — ignore
  }

  // Fetch menus separately (menu_manage_id is VARCHAR, no FK join)
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

  // 4. Build staff list with shift info
  const staffs = effectiveShifts.map((s) => ({
    id: s.staffId,
    name: s.staffName,
    isWorking: !!s.startTime,
    shiftStart: s.startTime,
    shiftEnd: s.endTime,
    shiftColor: s.abbreviationColor,
  }));

  // 5. Build appointment list
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
    // Per-appointment snapshot is the source of truth: appt.visit_count = 1
    // means "this is the customer's first actual visit" (see schema comment
    // in 00002_visit_sources_and_billing.sql). Falls back to the customer's
    // cumulative count for legacy rows.
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
      isMemberJoin: !!a.is_member_join,
    };
  });

  // 6. Generate time slots (default 9:00 - 21:00)
  const timeSlots = generateTimeSlots(9, 21, frameMin);

  return {
    staffs,
    appointments: calendarAppointments,
    timeSlots,
    frameMin,
  };
}
