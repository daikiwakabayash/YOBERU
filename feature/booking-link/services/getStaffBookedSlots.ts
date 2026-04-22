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
      // start_at は TZ なしで保存されるため、文字列の YYYY-MM-DD を
      // そのまま JST 日付として扱う (UTC→JST の +9h シフトをすると
      // 15:00 以降の予約が翌日扱いになる)。HH:MM 側も同様に slice
      // するので、この関数内で一貫している。
      const dateStr = a.start_at.slice(0, 10);
      return {
        date: dateStr,
        startMin: sH * 60 + sM,
        endMin: eH * 60 + eM,
      };
    }
  );
}
