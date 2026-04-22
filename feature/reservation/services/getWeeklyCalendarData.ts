"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { generateTimeSlots, toLocalDateString } from "@/helper/utils/time";
import { getWeekDates } from "@/helper/utils/weekday";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";
import {
  getDailyStaffUtilization,
  getRangeStaffUtilization,
} from "@/feature/sales/services/getStaffUtilization";
import type { CalendarAppointment } from "../types";

/**
 * Per-day utilization breakdown for the week header. Contains one
 * entry per weekDate (7 entries). `rate` is null when the day has
 * no shift at all (so the UI can render "—" instead of "0%").
 */
export interface DailyUtilization {
  date: string;
  rate: number | null;
  openMin: number;
  busyMin: number;
}

export interface WeeklyCalendarData {
  appointments: CalendarAppointment[];
  timeSlots: string[];
  frameMin: number;
  weekDates: string[]; // ["2026-04-06", "2026-04-07", ..., "2026-04-12"]
  staffName: string | null;
  /** Selected staff's 週間 稼働率 (0..1). null when no staff selected. */
  staffUtilizationRate: number | null;
  /** Total shift minutes for the week (denominator). */
  staffOpenMin: number;
  /** Total busy minutes for the week (numerator). */
  staffBusyMin: number;
  /** Per-day utilization rendered in the week header (7 entries). */
  dailyUtilization: DailyUtilization[];
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
    "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, cancelled_at, is_member_join, is_continued_billing, consumed_plan_id, consumed_amount, other_label, slot_block_type_code, customers(code, last_name, first_name, phone_number_1, visit_count, created_at)";
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
    if (
      msg.includes("is_member_join") ||
      msg.includes("is_continued_billing") ||
      msg.includes("consumed_plan_id") ||
      msg.includes("consumed_amount") ||
      msg.includes("other_label") ||
      msg.includes("slot_block_type_code") ||
      msg.includes("does not exist")
    ) {
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

  // Slot block master lookup (mirrors getCalendarData). Fails silently
  // if migration 00012 hasn't been applied — fallback palette is used.
  const slotBlockMasterMap = new Map<
    string,
    { label: string; color: string | null; labelTextColor: string | null }
  >();
  try {
    const { data: brandRow } = await supabase
      .from("shops")
      .select("brand_id")
      .eq("id", shopId)
      .maybeSingle();
    const brandId = (brandRow?.brand_id as number | null) ?? 1;
    const { data: sbTypes } = await supabase
      .from("slot_block_types")
      .select("code, label, color, label_text_color")
      .eq("brand_id", brandId)
      .is("deleted_at", null);
    for (const t of (sbTypes ?? []) as Array<{
      code: string;
      label: string;
      color: string | null;
      label_text_color: string | null;
    }>) {
      slotBlockMasterMap.set(t.code, {
        label: t.label,
        color: t.color,
        labelTextColor: t.label_text_color,
      });
    }
  } catch {
    /* migration 00012 not applied */
  }
  const SLOT_BLOCK_FALLBACK: Record<
    string,
    { label: string; color: string; labelTextColor: string }
  > = {
    meeting: { label: "ミーティング", color: "#9333ea", labelTextColor: "#ffffff" },
    other:   { label: "その他",       color: "#0ea5e9", labelTextColor: "#ffffff" },
    break:   { label: "休憩",         color: "#f59e0b", labelTextColor: "#ffffff" },
  };
  function resolveSlotBlock(typeNum: number, code: string | null) {
    if (typeNum === 0) return null;
    const resolved =
      code ?? (typeNum === 1 ? "meeting" : typeNum === 2 ? "other" : "meeting");
    const master = slotBlockMasterMap.get(resolved);
    if (master) {
      return {
        code: resolved,
        label: master.label,
        color: master.color,
        labelTextColor: master.labelTextColor,
      };
    }
    const fb = SLOT_BLOCK_FALLBACK[resolved];
    return fb
      ? { code: resolved, label: fb.label, color: fb.color, labelTextColor: fb.labelTextColor }
      : { code: resolved, label: resolved, color: "#6b7280", labelTextColor: "#ffffff" };
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
    is_continued_billing?: boolean | null;
    consumed_plan_id?: number | null;
    consumed_amount?: number | null;
    other_label?: string | null;
    slot_block_type_code?: string | null;
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

    const slotBlock = resolveSlotBlock(
      a.type,
      a.slot_block_type_code ?? null
    );

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
      isContinuedBilling: !!a.is_continued_billing,
      consumedPlanId: a.consumed_plan_id ?? null,
      consumedAmount: a.consumed_amount ?? 0,
      slotBlock,
      otherLabel: a.other_label ?? null,
    };
  });

  // 7. Generate time slots — fit the union of the staff's SHIFT hours
  //    across the week AND every appointment's time range. The previous
  //    version only considered appointments, so a 9-21 shift with 9-11
  //    appointments would show only 9-11 — that was the "予約表が 9 時
  //    から 11 時しか空いていない" bug.
  //
  //    Fetch the selected staff's shifts for each day in parallel.
  let weekShifts: Array<{
    startTime: string | null;
    endTime: string | null;
  }> = [];
  if (staffId) {
    try {
      const shiftResults = await Promise.all(
        weekDates.map((d) => getEffectiveShifts(shopId, d).catch(() => []))
      );
      for (const dayShifts of shiftResults) {
        for (const s of dayShifts) {
          if (s.staffId === staffId) {
            weekShifts.push({
              startTime: s.startTime,
              endTime: s.endTime,
            });
          }
        }
      }
    } catch {
      // Shift query failed — fall back to appointment-only range
    }
  }

  let minMin: number | null = null;
  let maxMin: number | null = null;

  function consider(startHHMM: string | null, endHHMM: string | null) {
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

  // Include staff shift times (covers the full working range)
  for (const s of weekShifts) {
    consider(s.startTime?.slice(0, 5) ?? null, s.endTime?.slice(0, 5) ?? null);
  }
  // Include appointment times (may extend outside shift, e.g. off-shift bookings)
  for (const a of appointments ?? []) {
    consider(
      (a.start_at as string | null)?.slice(11, 16) ?? null,
      (a.end_at as string | null)?.slice(11, 16) ?? null
    );
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

  // Selected staff's weekly utilization so the header can show a
  // "稼働率 47%" badge just like the day view does per staff column.
  // Only computed when a staff is selected (week view is always staff-
  // filtered) — otherwise the range aggregation has no target.
  //
  // We also compute per-day utilization (7 entries) so the column
  // headers can surface "this Tuesday the staff was 62% busy". These
  // run in parallel so the week load cost is bounded by the slowest
  // day, not linear.
  let staffUtilizationRate: number | null = null;
  let staffOpenMin = 0;
  let staffBusyMin = 0;
  let dailyUtilization: DailyUtilization[] = weekDates.map((d) => ({
    date: d,
    rate: null,
    openMin: 0,
    busyMin: 0,
  }));

  if (staffId) {
    const [rangeUtil, ...perDayResults] = await Promise.all([
      getRangeStaffUtilization(
        shopId,
        weekStart,
        weekDates[6],
        staffId
      ).catch(() => null),
      ...weekDates.map((d) =>
        getDailyStaffUtilization(shopId, d).catch(
          () => new Map<
            number,
            { openMin: number; busyMin: number; rate: number }
          >()
        )
      ),
    ]);

    if (rangeUtil) {
      const row = rangeUtil.get(staffId);
      if (row) {
        staffOpenMin = row.openMin;
        staffBusyMin = row.busyMin;
        staffUtilizationRate = row.openMin > 0 ? row.rate : null;
      }
    }

    dailyUtilization = weekDates.map((d, i) => {
      const row = perDayResults[i]?.get(staffId);
      if (!row) {
        return { date: d, rate: null, openMin: 0, busyMin: 0 };
      }
      return {
        date: d,
        openMin: row.openMin,
        busyMin: row.busyMin,
        rate: row.openMin > 0 ? row.rate : null,
      };
    });
  }

  return {
    appointments: calendarAppointments,
    timeSlots,
    frameMin,
    weekDates,
    staffName,
    staffUtilizationRate,
    staffOpenMin,
    staffBusyMin,
    dailyUtilization,
  };
}
