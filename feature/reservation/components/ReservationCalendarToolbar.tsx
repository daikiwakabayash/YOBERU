"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import { getWeekdayLabel } from "@/helper/utils/weekday";
import { toLocalDateString } from "@/helper/utils/time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  selectedStaffId = null,
}: ReservationCalendarToolbarProps) {
  const router = useRouter();
  const dateObj = new Date(currentDate + "T00:00:00");
  const weekday = getWeekdayLabel(dateObj);

  const displayDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekday})`;

  function buildUrl(params: { date?: string; view?: string; staff?: string | number | null }) {
    const searchParams = new URLSearchParams();
    const date = params.date ?? currentDate;
    searchParams.set("date", date);
    const view = params.view ?? viewMode;
    if (view === "week") searchParams.set("view", "week");
    const staff = params.staff !== undefined ? params.staff : selectedStaffId;
    if (staff) searchParams.set("staff", String(staff));
    return `/reservation?${searchParams.toString()}`;
  }

  function navigateDay(offset: number) {
    const newDate = new Date(currentDate + "T00:00:00");
    newDate.setDate(newDate.getDate() + offset);
    router.push(buildUrl({ date: toLocalDateString(newDate) }));
  }

  function navigateWeek(offset: number) {
    const newDate = new Date(currentDate + "T00:00:00");
    newDate.setDate(newDate.getDate() + offset * 7);
    router.push(buildUrl({ date: toLocalDateString(newDate) }));
  }

  function goToday() {
    router.push(buildUrl({ date: toLocalDateString(new Date()) }));
  }

  function switchView(view: "day" | "week") {
    router.push(buildUrl({ view }));
  }

  function changeStaff(staffId: string | null) {
    if (staffId) router.push(buildUrl({ staff: staffId }));
  }

  return (
    <div className="flex items-center gap-2">
      {/* Aggregate button */}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => router.push("/sales")}
      >
        <BarChart3 className="h-4 w-4" />
        集計実行
      </Button>

      {/* Navigation */}
      {viewMode === "day" ? (
        <>
          <Button variant="outline" size="sm" onClick={() => navigateDay(-1)}>
            <ChevronLeft className="h-4 w-4" />
            前日
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            今日
          </Button>
          <span className="min-w-[200px] text-center font-medium">
            {displayDate}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigateDay(1)}>
            翌日
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
            前週
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            今日
          </Button>
          <span className="min-w-[200px] text-center font-medium">
            {displayDate}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>
            次週
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* Day/Week toggle */}
      <div className="flex rounded-md border">
        <button
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === "day"
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } rounded-l-md`}
          onClick={() => switchView("day")}
        >
          日
        </button>
        <button
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === "week"
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } rounded-r-md border-l`}
          onClick={() => switchView("week")}
        >
          週
        </button>
      </div>

      {/* Staff selector (week view only) */}
      {viewMode === "week" && staffs.length > 0 && (
        <Select
          value={selectedStaffId ? String(selectedStaffId) : undefined}
          onValueChange={changeStaff}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="スタッフ選択" />
          </SelectTrigger>
          <SelectContent>
            {staffs.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
