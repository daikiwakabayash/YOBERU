"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";
import { toLocalDateString } from "@/helper/utils/time";
import { getShopAvailability } from "@/feature/booking-link/services/getShopAvailability";

/**
 * Staff utilization (稼働率) — how much of a staff member's open
 * shift time is actually filled with treatments.
 *
 *   稼働率 = busyMin / openMin
 *
 *   openMin = sum of effective shift durations on the date(s)
 *   busyMin = sum of (end_at - start_at) for completed (status=2) and
 *             in-progress (status=1) appointments. Cancelled (3 / 4 /
 *             99) and waiting (0) intentionally do NOT count yet —
 *             rate reflects actual treatment time only.
 *
 * Future: when we introduce a "type=meeting" appointment flag we'll
 * exclude those from busyMin too, per the spec ("MTGなどは稼働率の
 * 計算には入れない"). For now all appointments (except cancellations)
 * count as treatment time.
 */

export interface StaffUtilizationRow {
  staffId: number;
  staffName: string;
  openMin: number;
  busyMin: number;
  rate: number; // 0..1, 0 when openMin === 0
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(3, 5));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Daily utilization for the given shop & date — one row per staff that
 * either has a shift today OR has at least one appointment today.
 *
 * Used by the calendar header (= "稼働率 65%" badge next to each name).
 */
export async function getDailyStaffUtilization(
  shopId: number,
  date: string // YYYY-MM-DD (Asia/Tokyo)
): Promise<Map<number, StaffUtilizationRow>> {
  const supabase = await createClient();

  // 1. Effective shifts for the day → openMin per staff
  let shifts: Awaited<ReturnType<typeof getEffectiveShifts>> = [];
  try {
    shifts = await getEffectiveShifts(shopId, date);
  } catch {
    shifts = [];
  }

  const result = new Map<number, StaffUtilizationRow>();
  for (const s of shifts) {
    const sMin = parseHHMM(s.startTime);
    const eMin = parseHHMM(s.endTime);
    const openMin = sMin != null && eMin != null ? Math.max(0, eMin - sMin) : 0;
    result.set(s.staffId, {
      staffId: s.staffId,
      staffName: s.staffName,
      openMin,
      busyMin: 0,
      rate: 0,
    });
  }

  // 2. Sum busyMin from active appointments (status 1 or 2) on this date
  const nextDate = new Date(date + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  const { data: apptRes } = await supabase
    .from("appointments")
    .select("staff_id, start_at, end_at, status, customers(last_name, first_name)")
    .eq("shop_id", shopId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);

  type AppointmentLite = {
    staff_id: number;
    start_at: string;
    end_at: string;
    status: number;
  };
  for (const a of (apptRes ?? []) as AppointmentLite[]) {
    if (a.status !== 1 && a.status !== 2) continue;
    const sMin = parseHHMM(a.start_at?.slice(11, 16));
    const eMin = parseHHMM(a.end_at?.slice(11, 16));
    if (sMin == null || eMin == null) continue;
    const dur = Math.max(0, eMin - sMin);
    let row = result.get(a.staff_id);
    if (!row) {
      // Off-shift staff with appointments — still track them (rate
      // will be 0/0 = 0; we surface "稼働率 -" in the UI for these)
      row = {
        staffId: a.staff_id,
        staffName: "",
        openMin: 0,
        busyMin: 0,
        rate: 0,
      };
      result.set(a.staff_id, row);
    }
    row.busyMin += dur;
  }

  // 3. Finalize rate
  for (const row of result.values()) {
    row.rate = row.openMin > 0 ? row.busyMin / row.openMin : 0;
  }

  return result;
}

/**
 * Range utilization (multi-day) — used by the sales dashboard's
 * staff breakdown table to show 月間 / 期間の 開放時間 / 稼働時間 /
 * 稼働率.
 *
 *   - openMin: union of every staff member's daily shift duration in
 *     [startDate, endDate] (computed via the same getShopAvailability
 *     service the public booking page uses)
 *   - busyMin: sum of treatment-time durations across the same range
 *
 * Returns Map<staffId, StaffUtilizationRow>.
 */
export async function getRangeStaffUtilization(
  shopId: number,
  startDate: string,
  endDate: string,
  staffId?: number | null
): Promise<Map<number, StaffUtilizationRow>> {
  const supabase = await createClient();

  // 1. Sum openMin per staff from a single batched availability fetch.
  //    getShopAvailability already does the heavy lifting (overrides +
  //    defaults + work_patterns) so we reuse it instead of looping
  //    getEffectiveShifts day by day.
  const availability = await getShopAvailability(shopId, startDate, endDate);

  // We also need shift information PER staff, not just the shop union.
  // Re-walk the dates with getEffectiveShifts to attribute open minutes
  // back to individual staff. This is N day-queries but only fires from
  // /sales (not on every page render) so it's fine.
  const result = new Map<number, StaffUtilizationRow>();

  const startD = new Date(startDate + "T00:00:00");
  const endD = new Date(endDate + "T00:00:00");
  const dates: string[] = [];
  for (
    let d = new Date(startD);
    d.getTime() <= endD.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    dates.push(toLocalDateString(d));
  }

  // Skip days with zero shop availability — saves a getEffectiveShifts call.
  const nonEmptyDates = dates.filter((d) => availability[d] != null);

  // Run per-day shift lookups in parallel batches of 5 to avoid hammering
  // PostgREST while still finishing quickly for typical 30-day windows.
  const BATCH = 5;
  for (let i = 0; i < nonEmptyDates.length; i += BATCH) {
    const slice = nonEmptyDates.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((d) => getEffectiveShifts(shopId, d).catch(() => []))
    );
    for (const rows of results) {
      for (const s of rows) {
        if (staffId && s.staffId !== staffId) continue;
        const sMin = parseHHMM(s.startTime);
        const eMin = parseHHMM(s.endTime);
        const openMin =
          sMin != null && eMin != null ? Math.max(0, eMin - sMin) : 0;
        let row = result.get(s.staffId);
        if (!row) {
          row = {
            staffId: s.staffId,
            staffName: s.staffName,
            openMin: 0,
            busyMin: 0,
            rate: 0,
          };
          result.set(s.staffId, row);
        }
        row.openMin += openMin;
      }
    }
  }

  // 2. Sum busyMin from active appointments in the date range
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  let apptQuery = supabase
    .from("appointments")
    .select("staff_id, start_at, end_at, status")
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);
  if (staffId) apptQuery = apptQuery.eq("staff_id", staffId);

  const { data: apptRes } = await apptQuery;
  type AppointmentLite = {
    staff_id: number;
    start_at: string;
    end_at: string;
    status: number;
  };
  for (const a of (apptRes ?? []) as AppointmentLite[]) {
    if (a.status !== 1 && a.status !== 2) continue;
    const sMin = parseHHMM(a.start_at?.slice(11, 16));
    const eMin = parseHHMM(a.end_at?.slice(11, 16));
    if (sMin == null || eMin == null) continue;
    const dur = Math.max(0, eMin - sMin);
    let row = result.get(a.staff_id);
    if (!row) {
      row = {
        staffId: a.staff_id,
        staffName: "",
        openMin: 0,
        busyMin: 0,
        rate: 0,
      };
      result.set(a.staff_id, row);
    }
    row.busyMin += dur;
  }

  // 3. Finalize rate
  for (const row of result.values()) {
    row.rate = row.openMin > 0 ? row.busyMin / row.openMin : 0;
  }
  return result;
}
