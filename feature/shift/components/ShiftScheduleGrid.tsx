"use client";

import { toLocalDateString } from "@/helper/utils/time";
import { getWeekdayLabel } from "@/helper/utils/weekday";

export interface ShiftEntry {
  workPatternId: number | null;
  startTime: string | null;
  endTime: string | null;
  patternName: string | null;
  abbreviationName: string | null;
  abbreviationColor: string | null;
  isOverride: boolean;
}

interface Staff {
  id: number;
  name: string;
}

interface ShiftScheduleGridProps {
  staffs: Staff[];
  dates: string[];
  shifts: Record<string, ShiftEntry>;
}

function formatDate(dateStr: string): { dayMonth: string; weekday: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    dayMonth: `${d.getMonth() + 1}/${d.getDate()}`,
    weekday: getWeekdayLabel(d),
  };
}

function formatTime(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + "T00:00:00").getDay() === 0;
}

function isSaturday(dateStr: string): boolean {
  return new Date(dateStr + "T00:00:00").getDay() === 6;
}

function isMonday(dateStr: string): boolean {
  return new Date(dateStr + "T00:00:00").getDay() === 1;
}

export function ShiftScheduleGrid({
  staffs,
  dates,
  shifts,
}: ShiftScheduleGridProps) {
  const todayStr = toLocalDateString(new Date());

  // Each column is narrow (70px) so 28 days fit in a scrollable strip.
  const COL_WIDTH = 70;
  const STAFF_COL_WIDTH = 80;

  return (
    <div
      className="overflow-x-auto rounded-lg border bg-white"
      style={{ touchAction: "pan-x pan-y" }}
    >
      <table
        className="border-collapse text-[11px]"
        style={{
          minWidth: STAFF_COL_WIDTH + dates.length * COL_WIDTH,
        }}
      >
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-1.5 text-center text-[10px] font-bold text-gray-500"
              style={{
                width: STAFF_COL_WIDTH,
                minWidth: STAFF_COL_WIDTH,
                willChange: "transform",
              }}
            >
              スタッフ
            </th>
            {dates.map((date) => {
              const { dayMonth, weekday } = formatDate(date);
              const isToday = date === todayStr;
              const monday = isMonday(date);
              return (
                <th
                  key={date}
                  className={`border-b border-gray-200 py-1.5 text-center font-medium ${
                    monday ? "border-l-2 border-l-gray-400" : ""
                  } ${
                    isToday
                      ? "bg-blue-100 text-blue-700"
                      : isSunday(date)
                        ? "bg-red-50 text-red-500"
                        : isSaturday(date)
                          ? "bg-blue-50 text-blue-500"
                          : "bg-gray-50 text-gray-600"
                  }`}
                  style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                >
                  <div className="text-[10px]">{weekday}</div>
                  <div className="text-xs font-bold">{dayMonth}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staffs.map((staff) => (
            <tr key={staff.id} className="hover:bg-gray-50/50">
              <td
                className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-gray-900"
                style={{
                  width: STAFF_COL_WIDTH,
                  minWidth: STAFF_COL_WIDTH,
                  willChange: "transform",
                }}
              >
                {staff.name}
              </td>
              {dates.map((date) => {
                const key = `${staff.id}-${date}`;
                const shift = shifts[key];
                const isToday = date === todayStr;
                const monday = isMonday(date);

                return (
                  <td
                    key={date}
                    className={`border-b border-gray-100 px-0.5 py-1 text-center ${
                      monday ? "border-l-2 border-l-gray-400" : ""
                    } ${isToday ? "bg-blue-50/50" : ""}`}
                    style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                  >
                    {shift && shift.workPatternId !== null ? (
                      <div className="flex flex-col items-center gap-0">
                        <span
                          className="inline-block rounded px-1 py-0 text-[9px] font-bold leading-tight text-white"
                          style={{
                            backgroundColor:
                              shift.abbreviationColor || "#6B7280",
                          }}
                        >
                          {shift.abbreviationName || shift.patternName}
                        </span>
                        <span className="text-[9px] leading-tight text-gray-500">
                          {formatTime(shift.startTime)}-
                          {formatTime(shift.endTime)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[9px] text-gray-300">休</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {staffs.length === 0 && (
            <tr>
              <td
                colSpan={dates.length + 1}
                className="border-b border-gray-200 px-3 py-8 text-center text-gray-400"
              >
                スタッフが登録されていません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
