import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ShiftScheduleToolbar } from "@/feature/shift/components/ShiftScheduleToolbar";
import {
  ShiftScheduleGrid,
  type ShiftEntry,
} from "@/feature/shift/components/ShiftScheduleGrid";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";
import { getWeekDates } from "@/helper/utils/weekday";
import { Pencil } from "lucide-react";
import { getActiveShopId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function ShiftSchedulePage({ searchParams }: Props) {
  const shopId = await getActiveShopId();
  const params = await searchParams;

  // Determine the week start (Monday)
  const today = new Date();
  let weekStart: Date;
  if (params.week) {
    weekStart = new Date(params.week + "T00:00:00");
  } else {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekDates = getWeekDates(weekStart);
  const dateStrings = weekDates.map((d) => d.toISOString().split("T")[0]);
  const weekStartStr = dateStrings[0];

  // Fetch effective shifts for each day
  const shiftsMap: Record<string, ShiftEntry> = {};
  const staffSet = new Map<number, { id: number; name: string }>();

  try {
    const allDayShifts = await Promise.all(
      dateStrings.map((date) => getEffectiveShifts(shopId, date))
    );

    for (let i = 0; i < dateStrings.length; i++) {
      const date = dateStrings[i];
      const dayShifts = allDayShifts[i];
      for (const shift of dayShifts) {
        staffSet.set(shift.staffId, {
          id: shift.staffId,
          name: shift.staffName,
        });
        shiftsMap[`${shift.staffId}-${date}`] = {
          workPatternId: shift.workPatternId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          patternName: shift.patternName,
          abbreviationName: shift.abbreviationName,
          abbreviationColor: shift.abbreviationColor,
          isOverride: shift.isOverride,
        };
      }
    }
  } catch {
    // If fetching fails, show empty grid
  }

  const staffs = Array.from(staffSet.values());

  return (
    <div>
      <PageHeader
        title="出勤表"
        description="スタッフの週間出勤スケジュール"
        actions={
          <Link href={`/shift-schedule/edit?week=${weekStartStr}`}>
            <Button>
              <Pencil className="mr-1 h-4 w-4" />
              出勤修正
            </Button>
          </Link>
        }
      />
      <div className="space-y-4 p-6">
        <ShiftScheduleToolbar currentWeekStart={weekStartStr} />
        <ShiftScheduleGrid
          staffs={staffs}
          dates={dateStrings}
          shifts={shiftsMap}
        />
      </div>
    </div>
  );
}
