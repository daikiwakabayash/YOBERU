import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ShiftScheduleToolbar } from "@/feature/shift/components/ShiftScheduleToolbar";
import { ShiftEditForm } from "@/feature/shift/components/ShiftEditForm";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";
import { getWorkPatterns } from "@/feature/shift/services/getWorkPatterns";
import { getWeekDates } from "@/helper/utils/weekday";
import { ArrowLeft } from "lucide-react";
import type { ShiftEntry } from "@/feature/shift/components/ShiftScheduleGrid";

// TODO: brandId/shopId should come from session/context. Using 1 as placeholder.
const BRAND_ID = 1;
const SHOP_ID = 1;

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function ShiftScheduleEditPage({ searchParams }: Props) {
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

  // Fetch work patterns and effective shifts
  let workPatterns: Awaited<ReturnType<typeof getWorkPatterns>> = [];
  const shiftsMap: Record<string, ShiftEntry> = {};
  const staffSet = new Map<number, { id: number; name: string }>();

  try {
    workPatterns = await getWorkPatterns(SHOP_ID);

    const allDayShifts = await Promise.all(
      dateStrings.map((date) => getEffectiveShifts(SHOP_ID, date))
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
    // If fetching fails, show empty form
  }

  const staffs = Array.from(staffSet.values());

  return (
    <div>
      <PageHeader
        title="出勤修正"
        description="スタッフの出勤パターンを変更"
        actions={
          <Link href={`/shift-schedule?week=${weekStartStr}`}>
            <Button variant="outline">
              <ArrowLeft className="mr-1 h-4 w-4" />
              出勤表に戻る
            </Button>
          </Link>
        }
      />
      <div className="space-y-4 p-6">
        <ShiftScheduleToolbar
          currentWeekStart={weekStartStr}
          basePath="/shift-schedule/edit"
        />
        <ShiftEditForm
          staffs={staffs}
          dates={dateStrings}
          workPatterns={workPatterns}
          existingShifts={shiftsMap}
          brandId={BRAND_ID}
          shopId={SHOP_ID}
        />
      </div>
    </div>
  );
}
