"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getShiftColumnForDate } from "@/helper/utils/weekday";

/**
 * Per-staff 30-min free-slot sets for each date in the requested window.
 *
 * 公開予約カレンダー (AvailabilityCalendar) でスタッフ未選択のまま
 * 「店舗として空きがあるか」を判定するために使う。
 *
 * `getShopAvailability` は店舗の開店ウィンドウ (全スタッフ union) しか
 * 返さないため、実際には全スタッフが埋まっているスロットも "○" と
 * 表示されてしまう。本サービスは日ごと・スタッフごとに「そのスタッフが
 * 勤務中で、予約も入っていない 30 分スロット」の集合を計算して返す。
 *
 * クライアントは menuDuration 分の連続スロット全てを 1 人のスタッフが
 * 空けているか確認することで、正しく ○ / × を決められる。
 *
 * 実装: `getShopAvailability` と同じ取得パターンで staffs +
 * staff_shifts + work_patterns を 1 回ずつ取り、さらに期間内の
 * appointments を 1 回取って in-memory で集計する。
 */
export interface StaffFreeDay {
  staffId: number;
  /** Sorted 30-min slot start minutes (minutes-since-midnight). */
  freeSlotMins: number[];
}

export async function getShopStaffFreeSlots(
  shopId: number,
  startDate: string, // YYYY-MM-DD
  endDate: string // YYYY-MM-DD (inclusive)
): Promise<Record<string, StaffFreeDay[]>> {
  const supabase = await createClient();

  // 1. Public, active staff for the shop
  const { data: staffsRes } = await supabase
    .from("staffs")
    .select(
      "id, allocate_order, shift_monday, shift_tuesday, shift_wednesday, shift_thursday, shift_friday, shift_saturday, shift_sunday, shift_holiday"
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

  if (staffs.length === 0) return {};

  // 2. Shift overrides in range
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
  const overrideMap = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) {
    overrideMap.set(`${o.staff_id}|${o.start_date}`, o);
  }

  // 3. Work patterns (default lookup)
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

  // 4. All non-cancelled appointments in the date range for this shop.
  // 日跨ぎ予約はありえないので start_at で絞り込む (end_at も同日想定)。
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;

  const { data: apptsRes } = await supabase
    .from("appointments")
    .select("staff_id, start_at, end_at")
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("cancelled_at", null)
    .is("deleted_at", null);
  const appts = (apptsRes ?? []) as Array<{
    staff_id: number | null;
    start_at: string;
    end_at: string;
  }>;

  // Index appointments by (staff_id, date) for fast lookup.
  const apptsByStaffDate = new Map<
    string,
    Array<{ startMin: number; endMin: number }>
  >();
  for (const a of appts) {
    if (a.staff_id == null) continue;
    const dateStr = a.start_at.slice(0, 10);
    const sMin =
      Number(a.start_at.slice(11, 13)) * 60 +
      Number(a.start_at.slice(14, 16));
    const eMin =
      Number(a.end_at.slice(11, 13)) * 60 + Number(a.end_at.slice(14, 16));
    const key = `${a.staff_id}|${dateStr}`;
    const arr = apptsByStaffDate.get(key) ?? [];
    arr.push({ startMin: sMin, endMin: eMin });
    apptsByStaffDate.set(key, arr);
  }

  // Walk every date in [startDate, endDate]
  const out: Record<string, StaffFreeDay[]> = {};
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

    const perStaff: StaffFreeDay[] = [];
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
      if (!startStr || !endStr) continue; // off
      const sMin = parseHHMM(startStr);
      const eMin = parseHHMM(endStr);
      if (sMin == null || eMin == null) continue;

      // Build the staff's 30-min free-slot set over [sMin, eMin).
      const staffBookings = apptsByStaffDate.get(`${staff.id}|${dateStr}`) ?? [];
      // Round to 30-min boundaries so slot starts align with calendar grid.
      const firstSlot = Math.ceil(sMin / 30) * 30;
      const lastSlot = Math.floor(eMin / 30) * 30; // exclusive upper slot-start: slot T occupies [T, T+30)
      const free: number[] = [];
      for (let T = firstSlot; T + 30 <= eMin; T += 30) {
        if (T < sMin) continue; // shift starts mid-slot; skip partials
        const slotEnd = T + 30;
        // Blocked if any booking overlaps [T, slotEnd).
        const blocked = staffBookings.some(
          (b) => b.startMin < slotEnd && T < b.endMin
        );
        if (!blocked) free.push(T);
      }
      // silence unused (lastSlot just documents the upper bound)
      void lastSlot;
      if (free.length > 0) {
        perStaff.push({ staffId: staff.id, freeSlotMins: free });
      }
    }
    if (perStaff.length > 0) {
      out[dateStr] = perStaff;
    }
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
