"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StaffFreeDay } from "../../services/getShopStaffFreeSlots";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

/**
 * availability map から一番早い開始時刻と一番遅い終了時刻を求め、
 * 30 分刻みのスロット配列を返す。availability が無い場合は
 * 9:00–21:00 をフォールバック。
 */
function buildTimeSlots(
  availability?: Record<string, DayAvailability | null>
): string[] {
  let earliest = 9 * 60;  // default 09:00
  let latest = 21 * 60;   // default 21:00

  if (availability) {
    let hasAny = false;
    for (const day of Object.values(availability)) {
      if (!day) continue;
      hasAny = true;
      if (day.startMin < earliest) earliest = day.startMin;
      if (day.endMin > latest) latest = day.endMin;
    }
    if (!hasAny) {
      earliest = 9 * 60;
      latest = 21 * 60;
    }
  }

  // 30 分の境界に丸める
  earliest = Math.floor(earliest / 30) * 30;
  latest = Math.ceil(latest / 30) * 30;

  const slots: string[] = [];
  for (let min = earliest; min < latest; min += 30) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    slots.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    );
  }
  return slots;
}

/**
 * Per-day shop availability passed in by the parent. `null` for a date
 * means "closed / no staff scheduled". When undefined the calendar
 * falls back to the legacy "open everywhere" behaviour so unrelated
 * call sites keep working.
 */
export interface DayAvailability {
  startMin: number; // inclusive
  endMin: number;   // exclusive
}

/** Per-staff booked time range (from getStaffBookedSlots). */
export interface BookedRange {
  date: string;
  startMin: number;
  endMin: number;
}

interface AvailabilityCalendarProps {
  selectedDate: string | null; // YYYY-MM-DD
  selectedTime: string | null; // HH:MM
  onSelect: (date: string, time: string) => void;
  /**
   * Map of YYYY-MM-DD → open window (or null when closed). When provided
   * the calendar marks closed dates as "−" and time slots outside the
   * open window as "×".
   */
  availability?: Record<string, DayAvailability | null>;
  /**
   * Booked time ranges for the selected staff. When a slot overlaps any
   * of these ranges, it's marked as "×" (occupied) even if the shop's
   * open window says it's available.
   */
  bookedSlots?: BookedRange[];
  /**
   * Duration of the selected menu in minutes. Used to check whether the
   * appointment (slot start + duration) would overlap an existing booking.
   * Defaults to 60 if not provided.
   */
  menuDuration?: number;
  /**
   * Per-date map of each on-duty staff's free 30-min slot starts. Passed in
   * when the public booking link supports staff selection — allows the
   * calendar to mark a slot as "×" when *every* on-duty staff is already
   * booked (or off) for the full menu duration, even before the user has
   * picked a specific staff.
   */
  staffFreeByDate?: Record<string, StaffFreeDay[]>;
  /**
   * True when the user has already picked a specific staff. In that case
   * we skip the "shop has any staff free" check and rely on the existing
   * bookedSlots-based per-staff check.
   */
  hasSelectedStaff?: boolean;
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Get Monday-Sunday dates for the week containing the given date
 */
function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = [];
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function AvailabilityCalendar({
  selectedDate,
  selectedTime,
  onSelect,
  availability,
  bookedSlots = [],
  menuDuration = 60,
  staffFreeByDate,
  hasSelectedStaff = false,
}: AvailabilityCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const dates = getWeekDates(today);
    return dates[0];
  });

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const timeSlots = useMemo(() => buildTimeSlots(availability), [availability]);
  const now = useMemo(() => new Date(), []);
  const today = toLocalDateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  function shiftWeek(offset: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(d);
  }

  const monthLabel = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月`;

  // Index booked slots by date for O(1) lookup in getAvailability.
  const bookedByDate = useMemo(() => {
    const map = new Map<string, BookedRange[]>();
    for (const b of bookedSlots) {
      const arr = map.get(b.date) ?? [];
      arr.push(b);
      map.set(b.date, arr);
    }
    return map;
  }, [bookedSlots]);

  // Pre-convert freeSlotMins arrays into Sets for O(1) membership tests.
  const staffFreeSets = useMemo(() => {
    if (!staffFreeByDate) return null;
    const out = new Map<
      string,
      Array<{ staffId: number; freeSlotMins: Set<number> }>
    >();
    for (const [date, perStaff] of Object.entries(staffFreeByDate)) {
      out.set(
        date,
        perStaff.map((s) => ({
          staffId: s.staffId,
          freeSlotMins: new Set(s.freeSlotMins),
        }))
      );
    }
    return out;
  }, [staffFreeByDate]);

  /**
   * Availability resolution priority:
   *  1. Past (date < today, or today's already-passed slot) → "-"
   *  2. `availability` was provided AND date is closed → "-"
   *  3. `availability` was provided AND slot is outside open window → "×"
   *  4. A specific staff is selected AND they have an existing booking that
   *     overlaps [slotMin, slotMin + menuDuration) → "×"
   *  5. No staff selected AND `staffFreeByDate` is provided AND no on-duty
   *     staff is free for the entire [slotMin, slotMin + menuDuration) → "×"
   *  6. open
   *
   * Falls back to "always open" if the parent didn't pass `availability`.
   */
  function getAvailability(date: Date, time: string): "o" | "x" | "-" {
    const dateStr = toLocalDateString(date);
    if (dateStr < today) return "-";
    const [h, m] = time.split(":").map(Number);
    const slotMin = h * 60 + m;
    if (dateStr === today && slotMin <= nowMinutes) return "-";
    if (availability) {
      const day = availability[dateStr];
      if (day == null) return "-"; // closed: no staff scheduled
      if (slotMin < day.startMin || slotMin >= day.endMin) return "x";
    }
    const effectiveDuration = menuDuration > 0 ? menuDuration : 30;
    // Check if the proposed appointment [slotMin, slotMin + menuDuration)
    // overlaps any existing booking for the selected staff on this date.
    const dayBooked = bookedByDate.get(dateStr);
    if (dayBooked) {
      const apptEnd = slotMin + effectiveDuration;
      for (const b of dayBooked) {
        // Overlap: A.start < B.end AND B.start < A.end
        if (slotMin < b.endMin && b.startMin < apptEnd) {
          return "x";
        }
      }
    }
    // Shop-level check: スタッフ未選択時は「稼働スタッフのうち誰か 1 人が
    // menuDuration 分すべて空きかどうか」で判定する。全員埋まっていれば ×。
    // スタッフ選択済みなら上の dayBooked 判定に任せる (per-staff が厳密)。
    if (!hasSelectedStaff && staffFreeSets) {
      const perStaff = staffFreeSets.get(dateStr);
      if (!perStaff || perStaff.length === 0) return "x";
      const slotsNeeded = Math.ceil(effectiveDuration / 30);
      const anyStaffFree = perStaff.some((s) => {
        for (let i = 0; i < slotsNeeded; i++) {
          if (!s.freeSlotMins.has(slotMin + i * 30)) return false;
        }
        return true;
      });
      if (!anyStaffFree) return "x";
    }
    return "o";
  }

  return (
    <div className="space-y-2">
      {/* Month header */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="rounded-md p-1.5 hover:bg-gray-100"
          aria-label="前週"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <div className="text-sm font-medium text-gray-700">{monthLabel}</div>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="rounded-md p-1.5 hover:bg-gray-100"
          aria-label="次週"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {/* Weekday header */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-gray-200 bg-gray-50">
          <div />
          {weekDates.map((d, i) => {
            const dateStr = toLocalDateString(d);
            const isToday = dateStr === today;
            const dow = WEEKDAYS[i];
            const isSat = i === 5;
            const isSun = i === 6;
            return (
              <div
                key={dateStr}
                className={`flex flex-col items-center py-1.5 text-[11px] ${
                  isToday ? "bg-emerald-50" : ""
                }`}
              >
                <span
                  className={`font-medium ${
                    isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-gray-600"
                  }`}
                >
                  {dow}
                </span>
                <span
                  className={`text-[13px] font-bold ${
                    isToday
                      ? "text-emerald-600"
                      : isSun
                        ? "text-red-500"
                        : isSat
                          ? "text-blue-500"
                          : "text-gray-900"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Time slots */}
        <div className="max-h-[360px] overflow-y-auto">
          {timeSlots.map((time) => (
            <div
              key={time}
              className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center justify-center py-2 text-[11px] font-medium text-gray-500">
                {time}
              </div>
              {weekDates.map((d) => {
                const dateStr = toLocalDateString(d);
                const avail = getAvailability(d, time);
                const isSelected =
                  selectedDate === dateStr && selectedTime === time;
                const disabled = avail !== "o";
                return (
                  <button
                    key={`${dateStr}-${time}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(dateStr, time)}
                    className={`flex items-center justify-center border-l border-gray-100 py-2 text-[15px] transition-colors ${
                      isSelected
                        ? "bg-emerald-500 text-white"
                        : avail === "o"
                          ? "text-emerald-500 hover:bg-emerald-50"
                          : avail === "x"
                            ? "cursor-not-allowed text-gray-300"
                            : "cursor-not-allowed text-gray-200"
                    }`}
                  >
                    {avail === "o" ? "○" : avail === "x" ? "×" : "−"}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
