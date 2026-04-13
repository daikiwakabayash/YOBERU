"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

/**
 * Returns a Set-like array of occupied time ranges for a staff member
 * over a date range. Used by the public booking calendar to mark slots
 * as "×" when the staff already has an appointment.
 *
 * Each entry is { date: "YYYY-MM-DD", startMin: number, endMin: number }
 * where startMin/endMin are minutes-since-midnight.
 *
 * Only non-cancelled (cancelled_at IS NULL) and non-deleted
 * (deleted_at IS NULL) appointments are considered. Slot blocks
 * (type != 0) ARE included because they still block the calendar slot.
 */
export interface BookedRange {
  date: string;
  startMin: number;
  endMin: number;
}

export async function getStaffBookedSlots(
  shopId: number,
  staffId: number,
  startDate: string,
  endDate: string
): Promise<BookedRange[]> {
  const supabase = await createClient();

  // Day-exclusive upper bound for the range query
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  const { data, error } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("shop_id", shopId)
    .eq("staff_id", staffId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("cancelled_at", null)
    .is("deleted_at", null);

  if (error) {
    console.error("[getStaffBookedSlots]", error);
    return [];
  }

  return ((data ?? []) as Array<{ start_at: string; end_at: string }>).map(
    (a) => {
      const sH = Number(a.start_at.slice(11, 13));
      const sM = Number(a.start_at.slice(14, 16));
      const eH = Number(a.end_at.slice(11, 13));
      const eM = Number(a.end_at.slice(14, 16));
      // Derive the date from start_at (shift +9h for Asia/Tokyo)
      const d = new Date(a.start_at);
      d.setUTCHours(d.getUTCHours() + 9);
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        startMin: sH * 60 + sM,
        endMin: eH * 60 + eM,
      };
    }
  );
}

/**
 * Returns "fully booked" time ranges for a shop — slots where ALL on-shift
 * staff have overlapping appointments. Used by the booking calendar in
 * "any staff" mode (staffId === 0) so that the calendar can mark slots
 * as "×" when no staff is available.
 *
 * @param staffShiftsByDate  Map of YYYY-MM-DD → per-staff shift ranges.
 *        Only staff whose shift covers a slot are considered; a staff
 *        member off-shift at a given time is NOT counted as "available".
 */
export async function getShopFullyBookedSlots(
  shopId: number,
  startDate: string,
  endDate: string,
  staffShiftsByDate: Record<string, Array<{ staffId: number; startMin: number; endMin: number }>>
): Promise<BookedRange[]> {
  const supabase = await createClient();

  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  // Fetch ALL appointments for the shop in the date range
  const { data, error } = await supabase
    .from("appointments")
    .select("staff_id, start_at, end_at")
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("cancelled_at", null)
    .is("deleted_at", null);

  if (error) {
    console.error("[getShopFullyBookedSlots]", error);
    return [];
  }

  // Index appointments by date → staff_id → BookedRange[]
  const byDateStaff = new Map<string, Map<number, BookedRange[]>>();
  for (const a of (data ?? []) as Array<{
    staff_id: number;
    start_at: string;
    end_at: string;
  }>) {
    const d = new Date(a.start_at);
    d.setUTCHours(d.getUTCHours() + 9);
    const dateStr = d.toISOString().slice(0, 10);
    const sH = Number(a.start_at.slice(11, 13));
    const sM = Number(a.start_at.slice(14, 16));
    const eH = Number(a.end_at.slice(11, 13));
    const eM = Number(a.end_at.slice(14, 16));
    if (!byDateStaff.has(dateStr)) byDateStaff.set(dateStr, new Map());
    const staffMap = byDateStaff.get(dateStr)!;
    if (!staffMap.has(a.staff_id)) staffMap.set(a.staff_id, []);
    staffMap.get(a.staff_id)!.push({
      date: dateStr,
      startMin: sH * 60 + sM,
      endMin: eH * 60 + eM,
    });
  }

  // For each date, walk 30-min slots and check if ALL on-shift staff are booked
  const result: BookedRange[] = [];
  for (const [dateStr, shifts] of Object.entries(staffShiftsByDate)) {
    if (shifts.length === 0) continue;
    const staffMap = byDateStaff.get(dateStr);

    for (let slotMin = 0; slotMin < 24 * 60; slotMin += 30) {
      const slotEnd = slotMin + 30;
      // Only consider staff whose shift covers this slot
      const onShiftStaff = shifts.filter(
        (s) => s.startMin <= slotMin && s.endMin >= slotEnd
      );
      if (onShiftStaff.length === 0) continue; // no staff on shift at this time

      // Check if every on-shift staff has an overlapping appointment
      const allBusy = onShiftStaff.every((s) => {
        if (!staffMap) return false; // no appointments at all this day
        const ranges = staffMap.get(s.staffId);
        if (!ranges) return false; // this staff has no appointments → free
        return ranges.some((r) => r.startMin < slotEnd && slotMin < r.endMin);
      });
      if (allBusy) {
        result.push({ date: dateStr, startMin: slotMin, endMin: slotEnd });
      }
    }
  }
  return result;
}
