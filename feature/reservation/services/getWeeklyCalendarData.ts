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

  // Build appointments query. See getCalendarData.ts for the rationale
  // behind keeping a SAFE fallback select — pre-migration-00007
  // deployments don't have `is_member_join` and the query would silently
  // return null otherwise.
  const FULL_SELECT =
    "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, cancelled_at, is_member_join, customers(code, last_name, first_name, phone_number_1, visit_count, created_at)";
  const SAFE_SELECT =
    "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, cancelled_at, customers(code, last_name, first_name, phone_number_1, visit_count, created_at)";

  function buildQuery(select: string) {
    let q = supabase
      .from("appointments")
      .select(select)
      .eq("shop_id", shopId)
      .gte("start_at", `${weekStart}T00:00:00`)
      .lt("start_at", `${weekEndExclusive}T00:00:00`)
      // cancelled_at intentionally NOT filtered — see getCalendarData.ts
      .is("deleted_at", null)
      .order("start_at");
    if (staffId) {
      q = q.eq("staff_id", staffId);
    }
    return q;
  }

  // Parallel: shop + appointments + staff name
  const [shopRes, apptResRaw, staffRes] = await Promise.all([
    supabase.from("shops").select("frame_min").eq("id", shopId).single(),
    buildQuery(FULL_SELECT),
    staffId
      ? supabase.from("staffs").select("name").eq("id", staffId).single()
      : Promise.resolve({ data: null }),
  ]);

  let apptRes = apptResRaw;
  if (apptRes.error) {
    const msg = String(apptRes.error.message ?? "");
    if (msg.includes("is_member_join") || msg.includes("does not exist")) {
      console.error(
        "[getWeeklyCalendarData] full SELECT failed, retrying SAFE select",
        apptRes.error
      );
      apptRes = await buildQuery(SAFE_SELECT);
    } else {
      console.error(
        "[getWeeklyCalendarData] appointment query failed",
        apptRes.error
      );
    }
  }

  const frameMin = shopRes.data?.frame_min ?? 15;
  // Cast back from the widened generic select-string return type. See
  // getCalendarData.ts for the rationale.
  type RawAppointment = {
    id: number;
    staff_id: number;
    customer_id: number;
    start_at: string;
    end_at: string;
    status: number;
    type: number;
    menu_manage_id: string;
    memo: string | null;
    sales: number | null;
    customer_record: string | null;
    visit_count: number | null;
    visit_source_id: number | null;
    additional_charge: number | null;
    payment_method: string | null;
    cancelled_at: string | null;
    is_member_join?: boolean | null;
    customers:
      | {
          code: string | null;
          last_name: string | null;
          first_name: string | null;
          phone_number_1: string | null;
          visit_count: number | null;
        }
      | Array<{
          code: string | null;
          last_name: string | null;
          first_name: string | null;
          phone_number_1: string | null;
          visit_count: number | null;
        }>
      | null;
  };
  const appointments = (apptRes.data ?? []) as unknown as RawAppointment[];
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

  // 6. Build appointment list. The 新規 badge follows the same rule as
  //    getCalendarData: customer registered today only (otherwise existing).
  const calendarAppointments: CalendarAppointment[] = (
    appointments ?? []
  ).map((a) => {
    const rawCustomer = a.customers;
    const customer = (Array.isArray(rawCustomer)
      ? rawCustomer[0] ?? null
      : rawCustomer) as
      | {
          code: string | null;
          last_name: string | null;
          first_name: string | null;
          phone_number_1: string | null;
          visit_count: number | null;
          created_at: string | null;
        }
      | null;
    const sourceInfo = a.visit_source_id
      ? sourceMap.get(a.visit_source_id as number)
      : null;
    const menu = menuMap.get(a.menu_manage_id) ?? null;
    const apptVisitCount =
      (a.visit_count as number | null) ?? customer?.visit_count ?? 0;

    // 新規 only when customer.created_at is on the appointment's day
    // (Asia/Tokyo). Otherwise the customer existed before today and is
    // 既存. Falls back to visit_count snapshot if the column is missing.
    const apptDay = (a.start_at ?? "").slice(0, 10); // YYYY-MM-DD
    const apptDayStartMs = apptDay
      ? new Date(`${apptDay}T00:00:00+09:00`).getTime()
      : NaN;
    let isNewCustomer: boolean;
    if (customer?.created_at && Number.isFinite(apptDayStartMs)) {
      const createdMs = new Date(customer.created_at).getTime();
      isNewCustomer =
        Number.isFinite(createdMs) && createdMs >= apptDayStartMs;
    } else {
      isNewCustomer = apptVisitCount === 1;
    }

    return {
      id: a.id,
      staffId: a.staff_id,
      customerId: a.customer_id,
      menuManageId: a.menu_manage_id,
      customerName: customer
        ? `${customer.last_name ?? ""} ${customer.first_name ?? ""}`.trim()
        : "不明",
      customerCode: customer?.code ?? null,
      customerPhone: customer?.phone_number_1 ?? null,
      menuName: menu?.name ?? "不明",
      startAt: a.start_at,
      endAt: a.end_at,
      status: a.status,
      type: a.type,
      duration: menu?.duration ?? 0,
      memo: a.memo ?? null,
      isNewCustomer,
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

  // 7. Generate time slots — fit the union of every appointment's
  //    time range so the week view always covers the visible bookings.
  //    Defaults 9..21 when there's nothing to anchor on.
  let minMin: number | null = null;
  let maxMin: number | null = null;
  for (const a of appointments ?? []) {
    const startHHMM = (a.start_at as string | null)?.slice(11, 16) ?? null;
    const endHHMM = (a.end_at as string | null)?.slice(11, 16) ?? null;
    if (startHHMM) {
      const h = Number(startHHMM.slice(0, 2));
      const m = Number(startHHMM.slice(3, 5));
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const v = h * 60 + m;
        minMin = minMin == null ? v : Math.min(minMin, v);
      }
    }
    if (endHHMM) {
      const h = Number(endHHMM.slice(0, 2));
      const m = Number(endHHMM.slice(3, 5));
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const v = h * 60 + m;
        maxMin = maxMin == null ? v : Math.max(maxMin, v);
      }
    }
  }
  const startHour =
    minMin == null ? 9 : Math.max(0, Math.floor(minMin / 60));
  const endHour =
    maxMin == null ? 21 : Math.min(24, Math.ceil(maxMin / 60));
  const timeSlots = generateTimeSlots(
    startHour,
    Math.max(endHour, startHour + 1),
    frameMin
  );

  return {
    appointments: calendarAppointments,
    timeSlots,
    frameMin,
    weekDates,
    staffName,
  };
}
