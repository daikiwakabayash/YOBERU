"use server";

import { createClient } from "@/helper/lib/supabase/server";
import {
  computeMonthlyOvertime,
  computeOvertimeAmounts,
  type DayPunches,
  type OvertimeBreakdown,
} from "../utils/computeOvertime";

export interface StaffOvertimeResult {
  hourlyWage: number;
  breakdown: OvertimeBreakdown;
  amounts: ReturnType<typeof computeOvertimeAmounts>;
}

const FALLBACK_MONTHLY_HOURS = 160; // 月給 ÷ 160h で時給換算する慣行

/**
 * 1 スタッフの当月残業集計 + 金額。
 *
 * - hourly_wage 未設定なら monthly_min_salary / 160 で代替。
 * - 法定休日 (祝日 / 週 1 休日扱いの曜日) は MVP では false 固定。
 *   将来 holidays マスタを参照する拡張点。
 */
export async function getStaffOvertime(params: {
  staffId: number;
  yearMonth: string;
}): Promise<StaffOvertimeResult> {
  const supabase = await createClient();
  const { staffId, yearMonth } = params;
  const empty: StaffOvertimeResult = {
    hourlyWage: 0,
    breakdown: {
      regularMinutes: 0,
      overtimeMinutes: 0,
      heavyOvertimeMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 0,
    },
    amounts: {
      regular: 0,
      overtime: 0,
      heavyOvertime: 0,
      night: 0,
      holiday: 0,
      total: 0,
    },
  };
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return empty;

  const [year, month] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  // staffs から時給ベース取得 (空なら monthly_min_salary / 160)
  const { data: staff } = await supabase
    .from("staffs")
    .select("hourly_wage, monthly_min_salary")
    .eq("id", staffId)
    .maybeSingle();
  let hourly = (staff?.hourly_wage as number | null) ?? 0;
  if (!hourly) {
    const monthlyMin = (staff?.monthly_min_salary as number | null) ?? 0;
    hourly = monthlyMin > 0 ? Math.round(monthlyMin / FALLBACK_MONTHLY_HOURS) : 0;
  }

  const recordsRes = await supabase
    .from("time_records")
    .select("record_type, recorded_at, work_date")
    .eq("staff_id", staffId)
    .gte("work_date", start)
    .lt("work_date", end)
    .is("deleted_at", null)
    .order("recorded_at", { ascending: true });

  if (recordsRes.error) {
    return { ...empty, hourlyWage: hourly };
  }

  type DayBucket = {
    workDate: string;
    clockIn: Date | null;
    clockOut: Date | null;
    breaks: { start: Date; end: Date | null }[];
  };
  const byDate = new Map<string, DayBucket>();
  for (const r of recordsRes.data ?? []) {
    const wd = r.work_date as string;
    if (!byDate.has(wd)) {
      byDate.set(wd, { workDate: wd, clockIn: null, clockOut: null, breaks: [] });
    }
    const b = byDate.get(wd)!;
    const at = new Date(r.recorded_at as string);
    const t = r.record_type as string;
    if (t === "clock_in") {
      if (!b.clockIn) b.clockIn = at;
    } else if (t === "clock_out") {
      b.clockOut = at;
    } else if (t === "break_start") {
      b.breaks.push({ start: at, end: null });
    } else if (t === "break_end") {
      const last = b.breaks[b.breaks.length - 1];
      if (last && last.end == null) last.end = at;
    }
  }

  const days: DayPunches[] = [];
  for (const b of byDate.values()) {
    days.push({
      workDate: b.workDate,
      clockIn: b.clockIn,
      clockOut: b.clockOut,
      breaks: b.breaks
        .filter((br) => br.start && br.end)
        .map((br) => ({ start: br.start, end: br.end as Date })),
      isLegalHoliday: false,
    });
  }

  const breakdown = computeMonthlyOvertime(days);
  const amounts = computeOvertimeAmounts(hourly, breakdown);

  return { hourlyWage: hourly, breakdown, amounts };
}
