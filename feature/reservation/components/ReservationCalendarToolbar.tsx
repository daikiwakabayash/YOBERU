"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWeekdayLabel } from "@/helper/utils/weekday";

interface ReservationCalendarToolbarProps {
  currentDate: string;
  viewMode?: "day" | "week";
  staffs?: Array<{ id: number; name: string }>;
  selectedStaffId?: number | null;
}

export function ReservationCalendarToolbar({
  currentDate,
  viewMode = "day",
  staffs = [],
  selectedStaffId,
}: ReservationCalendarToolbarProps) {
  const router = useRouter();
  const dateObj = new Date(currentDate + "T00:00:00");
  const weekday = getWeekdayLabel(dateObj);
  const displayDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekday})`;

  function navigate(offset: number) {
    const newDate = new Date(currentDate + "T00:00:00");
    newDate.setDate(newDate.getDate() + (viewMode === "week" ? offset * 7 : offset));
    const dateStr = newDate.toISOString().split("T")[0];
    const params = new URLSearchParams();
    params.set("date", dateStr);
    if (viewMode === "week") params.set("view", "week");
    if (selectedStaffId) params.set("staff", String(selectedStaffId));
    router.push(`/reservation?${params.toString()}`);
  }

  function goToday() {
    const today = new Date().toISOString().split("T")[0];
    const params = new URLSearchParams();
    params.set("date", today);
    if (viewMode === "week") params.set("view", "week");
    if (selectedStaffId) params.set("staff", String(selectedStaffId));
    router.push(`/reservation?${params.toString()}`);
  }

  function toggleView(mode: "day" | "week") {
    const params = new URLSearchParams();
    params.set("date", currentDate);
    if (mode === "week") params.set("view", "week");
    if (selectedStaffId) params.set("staff", String(selectedStaffId));
    router.push(`/reservation?${params.toString()}`);
  }

  function selectStaff(staffId: number) {
    const params = new URLSearchParams();
    params.set("date", currentDate);
    params.set("view", "week");
    params.set("staff", String(staffId));
    router.push(`/reservation?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
        {viewMode === "week" ? "前週" : "前日"}
      </Button>
      <Button variant="outline" size="sm" onClick={goToday}>
        今日
      </Button>
      <span className="min-w-[180px] text-center text-sm font-medium">
        {displayDate}
      </span>
      <Button variant="outline" size="sm" onClick={() => navigate(1)}>
        {viewMode === "week" ? "次週" : "翌日"}
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Day/Week toggle */}
      <div className="ml-2 flex rounded-lg border">
        <button
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === "day"
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => toggleView("day")}
        >
          日
        </button>
        <button
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === "week"
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => toggleView("week")}
        >
          週
        </button>
      </div>

      {/* Staff selector for week view */}
      {viewMode === "week" && staffs.length > 0 && (
        <select
          className="ml-2 rounded-md border px-2 py-1.5 text-xs"
          value={selectedStaffId ?? ""}
          onChange={(e) => selectStaff(Number(e.target.value))}
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
