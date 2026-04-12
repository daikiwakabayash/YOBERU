"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toLocalDateString } from "@/helper/utils/time";

interface ShiftScheduleToolbarProps {
  currentWeekStart: string;
  basePath?: string;
}

function formatWeekRange(startDateStr: string): string {
  const start = new Date(startDateStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startYear = start.getFullYear();
  const startMonth = start.getMonth() + 1;
  const startDay = start.getDate();
  const endMonth = end.getMonth() + 1;
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startYear}年${startMonth}月${startDay}日 〜 ${endDay}日`;
  }
  return `${startYear}年${startMonth}月${startDay}日 〜 ${endMonth}月${endDay}日`;
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return toLocalDateString(d);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return toLocalDateString(d);
}

export function ShiftScheduleToolbar({
  currentWeekStart,
  basePath = "/shift-schedule",
}: ShiftScheduleToolbarProps) {
  const router = useRouter();

  const prevWeek = addWeeks(currentWeekStart, -1);
  const nextWeek = addWeeks(currentWeekStart, 1);
  const todayMonday = getMonday(toLocalDateString(new Date()));

  function navigateTo(week: string) {
    router.push(`${basePath}?week=${week}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateTo(prevWeek)}
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        前の週
      </Button>

      <span className="min-w-[200px] text-center text-sm font-medium text-gray-700">
        {formatWeekRange(currentWeekStart)}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateTo(nextWeek)}
      >
        次の週
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateTo(todayMonday)}
      >
        今週
      </Button>
    </div>
  );
}
