"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { generateTimeSlots } from "@/helper/utils/time";
import type { CalendarData, CalendarAppointment } from "../types";

/**
 * Aggregation service for the reservation calendar page.
 * Fetches all data needed to render the day-view calendar in one call.
 */
export async function getCalendarData(
  shopId: number,
  date: string
): Promise<CalendarData> {
  const supabase = await createClient();

  // 1. Get shop settings (frame_min)
  const { data: shop } = await supabase
    .from("shops")
    .select("frame_min")
    .eq("id", shopId)
    .single();

  const frameMin = shop?.frame_min ?? 15;

  // 2. Get effective shifts for this date
  const { getEffectiveShifts } = await import(
    "@/feature/shift/services/getStaffShifts"
  );
  let effectiveShifts: Awaited<ReturnType<typeof getEffectiveShifts>> = [];
  try {
    effectiveShifts = await getEffectiveShifts(shopId, date);
  } catch {
    // If no shifts data, return empty
  }

  // 3. Get appointments for this date
  const endDate = date; // Same day
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split("T")[0];

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, staff_id, start_at, end_at, status, type, menu_manage_id, customers(last_name, first_name), menus!appointments_menu_manage_id_fkey(name, duration)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("cancelled_at", null)
    .is("deleted_at", null)
    .order("start_at");

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
    } | null;
    const menu = a.menus as unknown as {
      name: string;
      duration: number;
    } | null;

    return {
      id: a.id,
      staffId: a.staff_id,
      customerName: customer
        ? `${customer.last_name ?? ""}${customer.first_name ?? ""}`
        : "不明",
      menuName: menu?.name ?? "不明",
      startAt: a.start_at,
      endAt: a.end_at,
      status: a.status,
      type: a.type,
      duration: menu?.duration ?? 0,
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
