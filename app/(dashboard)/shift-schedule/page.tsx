import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ShiftScheduleToolbar } from "@/feature/shift/components/ShiftScheduleToolbar";
import {
  ShiftScheduleGrid,
  type ShiftEntry,
} from "@/feature/shift/components/ShiftScheduleGrid";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";
import { getWorkPatterns } from "@/feature/shift/services/getWorkPatterns";
import { getWeekDates } from "@/helper/utils/weekday";
import { toLocalDateString } from "@/helper/utils/time";
import { createClient } from "@/helper/lib/supabase/server";
import { Pencil } from "lucide-react";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function ShiftSchedulePage({ searchParams }: Props) {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();
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

  // Expand to 4 weeks so the user can scroll through a month without
  // having to click "次の週" repeatedly. The start point is always
  // the selected week — we show 4 consecutive weeks from there.
  const WEEKS_TO_SHOW = 4;
  const allDates: string[] = [];
  for (let w = 0; w < WEEKS_TO_SHOW; w++) {
    const wStart = new Date(weekStart);
    wStart.setDate(weekStart.getDate() + w * 7);
    const weekDates = getWeekDates(wStart);
    for (const d of weekDates) {
      allDates.push(toLocalDateString(d));
    }
  }

  const weekStartStr = toLocalDateString(weekStart);

  // Fetch effective shifts for each day (parallel, batched)
  const shiftsMap: Record<string, ShiftEntry> = {};
  const staffSet = new Map<number, { id: number; name: string }>();

  try {
    const BATCH = 7;
    for (let i = 0; i < allDates.length; i += BATCH) {
      const slice = allDates.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map((date) => getEffectiveShifts(shopId, date))
      );
      for (let j = 0; j < slice.length; j++) {
        const date = slice[j];
        for (const shift of results[j]) {
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
    }
  } catch {
    // If fetching fails, show empty grid
  }

  const staffs = Array.from(staffSet.values());

  // Fetch work patterns for the inline shift edit popup quick-select
  let workPatterns: Array<{
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    abbreviation_name: string | null;
    abbreviation_color: string | null;
  }> = [];
  try {
    const patterns = await getWorkPatterns(brandId);
    workPatterns = patterns.map((p) => ({
      id: p.id,
      name: p.name,
      start_time: p.start_time,
      end_time: p.end_time,
      abbreviation_name: p.abbreviation_name ?? null,
      abbreviation_color: p.abbreviation_color ?? null,
    }));
  } catch {
    // Work patterns not available
  }

  return (
    <div>
      <PageHeader
        title="出勤表"
        description="スタッフの出勤スケジュール"
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
          dates={allDates}
          shifts={shiftsMap}
          brandId={brandId}
          shopId={shopId}
          workPatterns={workPatterns}
        />
      </div>
    </div>
  );
}
