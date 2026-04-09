"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWeekdayLabel } from "@/helper/utils/weekday";

interface ReservationCalendarToolbarProps {
  currentDate: string;
  viewMode?: "day" | "week";
  staffs?: Array<{ id: number; name: string }>;
  selectedStaffId?: number | null;
}

function buildUrl(
  date: string,
  view?: string,
  staffId?: number | null
): string {
  const params = new URLSearchParams();
  params.set("date", date);
  if (view === "week") params.set("view", "week");
  if (staffId) params.set("staff", String(staffId));
  return `/reservation?${params.toString()}`;
}

function offsetDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function ReservationCalendarToolbar({
  currentDate,
  viewMode = "day",
  staffs = [],
  selectedStaffId,
}: ReservationCalendarToolbarProps) {
  const dateObj = new Date(currentDate + "T00:00:00");
  const weekday = getWeekdayLabel(dateObj);
  const displayDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekday})`;

  const prevOffset = viewMode === "week" ? -7 : -1;
  const nextOffset = viewMode === "week" ? 7 : 1;
  const prevDate = offsetDate(currentDate, prevOffset);
  const nextDate = offsetDate(currentDate, nextOffset);
  const today = new Date().toISOString().split("T")[0];

  const prevUrl = buildUrl(prevDate, viewMode, selectedStaffId);
  const nextUrl = buildUrl(nextDate, viewMode, selectedStaffId);
  const todayUrl = buildUrl(today, viewMode, selectedStaffId);
  const dayUrl = buildUrl(currentDate, "day", selectedStaffId);
  const weekUrl = buildUrl(currentDate, "week", selectedStaffId || staffs[0]?.id);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={prevUrl} prefetch={true}>
        <Button variant="outline" size="sm">
          <ChevronLeft className="h-4 w-4" />
          {viewMode === "week" ? "前週" : "前日"}
        </Button>
      </Link>
      <Link href={todayUrl} prefetch={true}>
        <Button variant="outline" size="sm">
          今日
        </Button>
      </Link>
      <span className="min-w-[180px] text-center text-sm font-medium">
        {displayDate}
      </span>
      <Link href={nextUrl} prefetch={true}>
        <Button variant="outline" size="sm">
          {viewMode === "week" ? "次週" : "翌日"}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </Link>

      {/* Day/Week toggle */}
      <div className="ml-2 flex rounded-lg border overflow-hidden">
        <Link
          href={dayUrl}
          prefetch={true}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === "day"
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          日
        </Link>
        <Link
          href={weekUrl}
          prefetch={true}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === "week"
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          週
        </Link>
      </div>

      {/* Staff selector for week view */}
      {viewMode === "week" && staffs.length > 0 && (
        <select
          className="ml-2 rounded-md border px-2 py-1.5 text-xs"
          value={selectedStaffId ?? ""}
          onChange={(e) => {
            const sid = Number(e.target.value);
            window.location.href = buildUrl(currentDate, "week", sid);
          }}
        >
          {staffs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
