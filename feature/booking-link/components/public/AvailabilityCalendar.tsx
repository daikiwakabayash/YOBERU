"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 10; h <= 20; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
})();

interface AvailabilityCalendarProps {
  selectedDate: string | null; // YYYY-MM-DD
  selectedTime: string | null; // HH:MM
  onSelect: (date: string, time: string) => void;
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
}: AvailabilityCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const dates = getWeekDates(today);
    return dates[0];
  });

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const now = useMemo(() => new Date(), []);
  const today = toLocalDateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  function shiftWeek(offset: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(d);
  }

  const monthLabel = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月`;

  /**
   * Availability placeholder.
   * TODO: Replace with real shift + appointment lookup.
   * For now: past = "-", future = "○", after 20:00 = "×"
   */
  function getAvailability(date: Date, time: string): "o" | "x" | "-" {
    const dateStr = toLocalDateString(date);
    if (dateStr < today) return "-";
    const [h, m] = time.split(":").map(Number);
    const slotMin = h * 60 + m;
    if (dateStr === today && slotMin <= nowMinutes) return "-";
    // Example: randomly mark some as unavailable for demo realism
    const seed = (date.getDate() * 31 + h * 7 + m) % 13;
    if (seed === 0 || seed === 5) return "x";
    return "o";
  }

  return (
    <div className="space-y-2">
      {/* LINE notify button */}
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
          L
        </span>
        空きが出たらLINEでお知らせ
        <ChevronRight className="h-4 w-4" />
      </button>

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
          {TIME_SLOTS.map((time) => (
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
