"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWeekdayLabel } from "@/helper/utils/weekday";

interface ReservationCalendarToolbarProps {
  currentDate: string;
}

export function ReservationCalendarToolbar({
  currentDate,
}: ReservationCalendarToolbarProps) {
  const router = useRouter();
  const dateObj = new Date(currentDate);
  const weekday = getWeekdayLabel(dateObj);

  const displayDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekday})`;

  function navigate(offset: number) {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + offset);
    const dateStr = newDate.toISOString().split("T")[0];
    router.push(`/reservation?date=${dateStr}`);
  }

  function goToday() {
    const today = new Date().toISOString().split("T")[0];
    router.push(`/reservation?date=${today}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
        前日
      </Button>
      <Button variant="outline" size="sm" onClick={goToday}>
        今日
      </Button>
      <span className="min-w-[200px] text-center font-medium">
        {displayDate}
      </span>
      <Button variant="outline" size="sm" onClick={() => navigate(1)}>
        翌日
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
