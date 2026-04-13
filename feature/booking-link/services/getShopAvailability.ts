"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getShiftColumnForDate } from "@/helper/utils/weekday";

/**
 * Per-day availability summary for the public booking page.
 *
 * For each date in the requested window, returns the union of every
 * working staff's effective shift (the shop's open window for that day):
 *   { startMin: number, endMin: number, staffIds: number[] }  →  open
 *   null                                                       →  closed
 *
 * Used by AvailabilityCalendar to mark cells outside the open window as
 * "×" (and entire days with no staff as "−") instead of the previous
 * fake / random availability placeholder.
 *
 * Implementation: one batched fetch each for staffs / staff_shifts /
 * work_patterns, then a per-date in-memory computation. Same logic as
 * getEffectiveShifts but loops over many dates from a single dataset.
 */
export interface ShopAvailabilityDay {
  startMin: number; // inclusive, minutes-since-midnight
  endMin: number;   // exclusive
  staffIds: number[];
  staffShifts: Array<{ staffId: number; startMin: number; endMin: number }>;
}

export async function getShopAvailability(
  shopId: number,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD (inclusive)
): Promise<Record<string, ShopAvailabilityDay | null>> {
  const supabase = await createClient();

  // 1. All public, active staff for the shop with their default shift columns
  const { data: staffsRes } = await supabase
    .from("staffs")
    .select(
      "id, name, allocate_order, shift_monday, shift_tuesday, shift_wednesday, shift_thursday, shift_friday, shift_saturday, shift_sunday, shift_holiday"
    )
    .eq("shop_id", shopId)
    .eq("is_public", true)
    .is("deleted_at", null)
    .order("allocate_order", { ascending: true, nullsFirst: false });
  const staffs = (staffsRes ?? []) as Array<{
    id: number;
    shift_monday: number | null;
    shift_tuesday: number | null;
    shift_wednesday: number | null;
    shift_thursday: number | null;
    shift_friday: number | null;
    shift_saturday: number | null;
    shift_sunday: number | null;
    shift_holiday: number | null;
  }>;

  // 2. All overrides in the requested date range
  const { data: overridesRes } = await supabase
    .from("staff_shifts")
    .select("staff_id, start_date, work_pattern_id, start_time, end_time")
    .eq("shop_id", shopId)
    .gte("start_date", startDate)
    .lte("start_date", endDate)
    .is("deleted_at", null);
  const overrides = (overridesRes ?? []) as Array<{
    staff_id: number;
    start_date: string;
    work_pattern_id: number | null;
    start_time: string | null;
    end_time: string | null;
  }>;

  // 3. All work_patterns the shop knows about (default lookups)
  const { data: patternsRes } = await supabase
    .from("work_patterns")
    .select("id, start_time, end_time")
    .eq("shop_id", shopId)
    .is("deleted_at", null);
  const patternMap = new Map<
    number,
    { start_time: string | null; end_time: string | null }
  >();
  for (const p of (patternsRes ?? []) as Array<{
    id: number;
    start_time: string | null;
    end_time: string | null;
  }>) {
    patternMap.set(p.id, { start_time: p.start_time, end_time: p.end_time });
  }

  // Index overrides by (staff_id, date) for O(1) lookup per (staff, day)
  const overrideMap = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) {
    overrideMap.set(`${o.staff_id}|${o.start_date}`, o);
  }

  // Walk every date from startDate to endDate inclusive
  const out: Record<string, ShopAvailabilityDay | null> = {};
  const startD = new Date(startDate + "T00:00:00");
  const endD = new Date(endDate + "T00:00:00");
  for (
    let d = new Date(startD);
    d.getTime() <= endD.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const shiftColumn = getShiftColumnForDate(d) as
      | "shift_monday"
      | "shift_tuesday"
      | "shift_wednesday"
      | "shift_thursday"
      | "shift_friday"
      | "shift_saturday"
      | "shift_sunday"
      | "shift_holiday";

    let dayMinStart: number | null = null;
    let dayMaxEnd: number | null = null;
    const dayStaffIds: number[] = [];
    const dayStaffShifts: Array<{ staffId: number; startMin: number; endMin: number }> = [];

    for (const staff of staffs) {
      const override = overrideMap.get(`${staff.id}|${dateStr}`);
      let startStr: string | null = null;
      let endStr: string | null = null;

      if (override) {
        startStr = override.start_time;
        endStr = override.end_time;
        if ((!startStr || !endStr) && override.work_pattern_id) {
          const wp = patternMap.get(override.work_pattern_id);
          if (wp) {
            startStr = startStr ?? wp.start_time;
            endStr = endStr ?? wp.end_time;
          }
        }
      } else {
        const defaultPatternId = staff[shiftColumn];
        if (defaultPatternId) {
          const wp = patternMap.get(defaultPatternId);
          if (wp) {
            startStr = wp.start_time;
            endStr = wp.end_time;
          }
        }
      }

      if (!startStr || !endStr) continue; // off this day
      const sMin = parseHHMM(startStr);
      const eMin = parseHHMM(endStr);
      if (sMin == null || eMin == null) continue;

      dayStaffIds.push(staff.id);
      dayStaffShifts.push({ staffId: staff.id, startMin: sMin, endMin: eMin });
      dayMinStart = dayMinStart == null ? sMin : Math.min(dayMinStart, sMin);
      dayMaxEnd = dayMaxEnd == null ? eMin : Math.max(dayMaxEnd, eMin);
    }

    out[dateStr] =
      dayMinStart != null && dayMaxEnd != null
        ? { startMin: dayMinStart, endMin: dayMaxEnd, staffIds: dayStaffIds, staffShifts: dayStaffShifts }
        : null;
  }
  return out;
}

function parseHHMM(s: string | null): number | null {
  if (!s) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(3, 5));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
