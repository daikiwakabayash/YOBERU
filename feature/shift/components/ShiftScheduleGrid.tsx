"use client";

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${getWeekdayLabel(d)})`;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0;
}

function isSaturday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 6;
}

export function ShiftScheduleGrid({
  staffs,
  dates,
  shifts,
}: ShiftScheduleGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-700">
              スタッフ
            </th>
            {dates.map((date) => (
              <th
                key={date}
                className={`border border-gray-200 px-3 py-2 text-center font-medium ${
                  isSunday(date)
                    ? "bg-red-50 text-red-600"
                    : isSaturday(date)
                      ? "bg-blue-50 text-blue-600"
                      : "bg-gray-50 text-gray-700"
                }`}
              >
                {formatDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staffs.map((staff) => (
            <tr key={staff.id} className="hover:bg-gray-50/50">
              <td className="sticky left-0 z-10 border border-gray-200 bg-white px-3 py-2 font-medium text-gray-900">
                {staff.name}
              </td>
              {dates.map((date) => {
                const key = `${staff.id}-${date}`;
                const shift = shifts[key];
                const weekend = isWeekend(date);

                return (
                  <td
                    key={date}
                    className={`border border-gray-200 px-2 py-2 text-center ${
                      weekend ? "bg-gray-50/50" : ""
                    }`}
                  >
                    {shift && shift.workPatternId !== null ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className="inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium text-white"
                          style={{
                            backgroundColor:
                              shift.abbreviationColor || "#6B7280",
                          }}
                        >
                          {shift.abbreviationName || shift.patternName}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {formatTime(shift.startTime)}-
                          {formatTime(shift.endTime)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">休</span>
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
                className="border border-gray-200 px-3 py-8 text-center text-gray-400"
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
