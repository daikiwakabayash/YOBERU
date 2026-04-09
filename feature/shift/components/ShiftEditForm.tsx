"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { getWeekdayLabel } from "@/helper/utils/weekday";
import { bulkUpsertStaffShifts } from "../actions/staffShiftActions";
import { toast } from "sonner";
import type { ShiftEntry } from "./ShiftScheduleGrid";

interface Staff {
  id: number;
  name: string;
}

interface WorkPattern {
  id: number;
  name: string;
  abbreviation_name: string | null;
  abbreviation_color: string | null;
  start_time: string;
  end_time: string;
}

interface ShiftEditFormProps {
  staffs: Staff[];
  dates: string[];
  workPatterns: WorkPattern[];
  existingShifts: Record<string, ShiftEntry>;
  brandId: number;
  shopId: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${getWeekdayLabel(d)})`;
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

export function ShiftEditForm({
  staffs,
  dates,
  workPatterns,
  existingShifts,
  brandId,
  shopId,
}: ShiftEditFormProps) {
  // State: key = "${staffId}-${date}", value = workPatternId or null (day off)
  const [selections, setSelections] = useState<Record<string, number | null>>(
    () => {
      const initial: Record<string, number | null> = {};
      for (const staff of staffs) {
        for (const date of dates) {
          const key = `${staff.id}-${date}`;
          const existing = existingShifts[key];
          initial[key] = existing?.workPatternId ?? null;
        }
      }
      return initial;
    }
  );

  const [isSaving, setIsSaving] = useState(false);

  const handleChange = useCallback(
    (staffId: number, date: string, value: string) => {
      const key = `${staffId}-${date}`;
      setSelections((prev) => ({
        ...prev,
        [key]: value === "" ? null : Number(value),
      }));
    },
    []
  );

  async function handleSave() {
    setIsSaving(true);
    try {
      const shifts: {
        staff_id: number;
        brand_id: number;
        shop_id: number;
        work_pattern_id: number | null;
        start_date: string;
        start_time: string;
        end_time: string;
      }[] = [];

      for (const staff of staffs) {
        for (const date of dates) {
          const key = `${staff.id}-${date}`;
          const patternId = selections[key];
          const pattern = patternId
            ? workPatterns.find((p) => p.id === patternId)
            : null;

          shifts.push({
            staff_id: staff.id,
            brand_id: brandId,
            shop_id: shopId,
            work_pattern_id: patternId,
            start_date: date,
            start_time: pattern?.start_time ?? "00:00",
            end_time: pattern?.end_time ?? "00:00",
          });
        }
      }

      const result = await bulkUpsertStaffShifts(shifts);
      if (result && "error" in result && result.error) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "保存に失敗しました"
        );
      } else {
        toast.success("出勤表を保存しました");
      }
    } catch {
      toast.error("保存中にエラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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
              <tr key={staff.id}>
                <td className="sticky left-0 z-10 border border-gray-200 bg-white px-3 py-2 font-medium text-gray-900">
                  {staff.name}
                </td>
                {dates.map((date) => {
                  const key = `${staff.id}-${date}`;
                  const value = selections[key];
                  const weekend = isWeekend(date);

                  return (
                    <td
                      key={date}
                      className={`border border-gray-200 px-1 py-1 ${
                        weekend ? "bg-gray-50/50" : ""
                      }`}
                    >
                      <select
                        className="w-full min-w-[100px] rounded border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={value ?? ""}
                        onChange={(e) =>
                          handleChange(staff.id, date, e.target.value)
                        }
                      >
                        <option value="">休み</option>
                        {workPatterns.map((pattern) => (
                          <option key={pattern.id} value={pattern.id}>
                            {pattern.name} ({pattern.start_time.slice(0, 5)}-
                            {pattern.end_time.slice(0, 5)})
                          </option>
                        ))}
                      </select>
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving || staffs.length === 0}>
          {isSaving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
