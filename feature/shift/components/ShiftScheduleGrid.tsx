"use client";

import { useState } from "react";
import { toLocalDateString } from "@/helper/utils/time";
import { getWeekdayLabel } from "@/helper/utils/weekday";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toast } from "sonner";
import { quickUpsertShift } from "../actions/staffShiftActions";

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
  brandId?: number;
  shopId?: number;
  workPatterns?: Array<{
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    abbreviation_name: string | null;
    abbreviation_color: string | null;
  }>;
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

// Generate hour options for the inline time picker
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

export function ShiftScheduleGrid({
  staffs,
  dates,
  shifts,
  brandId = 1,
  shopId = 1,
  workPatterns = [],
}: ShiftScheduleGridProps) {
  const todayStr = toLocalDateString(new Date());

  // Inline edit popup state
  const [editCell, setEditCell] = useState<{
    staffId: number;
    staffName: string;
    date: string;
    startH: string;
    startM: string;
    endH: string;
    endM: string;
    patternId: number | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  function openEdit(staff: Staff, date: string) {
    const key = `${staff.id}-${date}`;
    const shift = shifts[key];
    const st = formatTime(shift?.startTime);
    const et = formatTime(shift?.endTime);
    setEditCell({
      staffId: staff.id,
      staffName: staff.name,
      date,
      startH: st ? st.slice(0, 2) : "09",
      startM: st ? st.slice(3, 5) : "00",
      endH: et ? et.slice(0, 2) : "21",
      endM: et ? et.slice(3, 5) : "00",
      patternId: shift?.workPatternId ?? null,
    });
  }

  async function handleSave() {
    if (!editCell) return;
    setSaving(true);
    const startTime = `${editCell.startH}:${editCell.startM}:00`;
    const endTime = `${editCell.endH}:${editCell.endM}:00`;
    const result = await quickUpsertShift({
      staffId: editCell.staffId,
      brandId,
      shopId,
      date: editCell.date,
      workPatternId: editCell.patternId ?? workPatterns[0]?.id ?? 1,
      startTime,
      endTime,
    });
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("シフトを更新しました");
      setEditCell(null);
    }
  }

  async function handleSetDayOff() {
    if (!editCell) return;
    setSaving(true);
    const result = await quickUpsertShift({
      staffId: editCell.staffId,
      brandId,
      shopId,
      date: editCell.date,
      workPatternId: null,
      startTime: "00:00:00",
      endTime: "00:00:00",
    });
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("休日に変更しました");
      setEditCell(null);
    }
  }

  const COL_WIDTH = 70;
  const STAFF_COL_WIDTH = 80;

  return (
    <>
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
                      className={`cursor-pointer border-b border-gray-100 px-0.5 py-1 text-center transition-colors hover:bg-blue-50 ${
                        monday ? "border-l-2 border-l-gray-400" : ""
                      } ${isToday ? "bg-blue-50/50" : ""}`}
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      onClick={() => openEdit(staff, date)}
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

      {/* ===== Inline shift edit popup ===== */}
      {editCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="w-[340px] rounded-xl border bg-white p-5 shadow-xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-bold text-gray-900">
                {(() => {
                  const d = new Date(editCell.date + "T00:00:00");
                  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${getWeekdayLabel(d)})`;
                })()}
                　{editCell.staffName}
              </div>
              <button
                type="button"
                onClick={() => setEditCell(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Work pattern quick-select */}
            {workPatterns.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {workPatterns.map((wp) => (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => {
                      setEditCell({
                        ...editCell,
                        patternId: wp.id,
                        startH: wp.start_time.slice(0, 2),
                        startM: wp.start_time.slice(3, 5),
                        endH: wp.end_time.slice(0, 2),
                        endM: wp.end_time.slice(3, 5),
                      });
                    }}
                    className="rounded border px-2 py-1 text-xs font-bold transition-colors hover:bg-gray-100"
                    style={{
                      borderColor:
                        editCell.patternId === wp.id
                          ? wp.abbreviation_color ?? "#6366f1"
                          : "#e5e7eb",
                      backgroundColor:
                        editCell.patternId === wp.id
                          ? `${wp.abbreviation_color ?? "#6366f1"}20`
                          : "white",
                    }}
                  >
                    {wp.abbreviation_name || wp.name}
                  </button>
                ))}
              </div>
            )}

            {/* Time pickers */}
            <div className="mb-3 flex items-center gap-1 text-sm">
              <select
                value={editCell.startH}
                onChange={(e) =>
                  setEditCell({ ...editCell, startH: e.target.value })
                }
                className="rounded border px-1 py-1 text-center"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              :
              <select
                value={editCell.startM}
                onChange={(e) =>
                  setEditCell({ ...editCell, startM: e.target.value })
                }
                className="rounded border px-1 py-1 text-center"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="mx-1">〜</span>
              <select
                value={editCell.endH}
                onChange={(e) =>
                  setEditCell({ ...editCell, endH: e.target.value })
                }
                className="rounded border px-1 py-1 text-center"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              :
              <select
                value={editCell.endM}
                onChange={(e) =>
                  setEditCell({ ...editCell, endM: e.target.value })
                }
                className="rounded border px-1 py-1 text-center"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 rounded bg-yellow-50 px-3 py-1.5 text-xs font-bold text-yellow-800">
              【確定時間】{editCell.startH}:{editCell.startM}〜{editCell.endH}:
              {editCell.endM}
            </div>

            {/* Day off option */}
            <button
              type="button"
              onClick={handleSetDayOff}
              disabled={saving}
              className="mb-4 flex w-full items-center gap-2 rounded border px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            >
              <span className="h-3 w-3 rounded-full border-2 border-gray-400" />
              休日に変更
            </button>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditCell(null)}
                disabled={saving}
              >
                閉じる
              </Button>
              <Button
                className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "保存中..." : "確定（変更）"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
