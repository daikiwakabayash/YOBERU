"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

export type PunchType =
  | "clock_in"
  | "clock_out"
  | "break_start"
  | "break_end";

export interface TimeRecordRow {
  id: number;
  staffId: number;
  shopId: number;
  type: PunchType;
  recordedAt: string;
  workDate: string;
  distanceM: number | null;
}

/**
 * 当該スタッフの「今日 (Asia/Tokyo) の打刻一覧」を取得。
 * /punch ページで「今出勤しているか / 休憩中か / もう退勤済か」の
 * UI 状態判定に使う。
 */
export async function getTodayPunches(staffId: number): Promise<TimeRecordRow[]> {
  const supabase = await createClient();
  const today = toLocalDateString(new Date());

  const { data, error } = await supabase
    .from("time_records")
    .select("id, staff_id, shop_id, record_type, recorded_at, work_date, distance_m")
    .eq("staff_id", staffId)
    .eq("work_date", today)
    .is("deleted_at", null)
    .order("recorded_at", { ascending: true });

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("time_records") ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((r) => ({
    id: r.id as number,
    staffId: r.staff_id as number,
    shopId: r.shop_id as number,
    type: r.record_type as PunchType,
    recordedAt: r.recorded_at as string,
    workDate: r.work_date as string,
    distanceM: (r.distance_m as number | null) ?? null,
  }));
}

export interface MonthlyAttendanceRow {
  workDate: string;
  type: PunchType;
  recordedAt: string;
}

/**
 * 月次の打刻一覧 (残業集計のサービスなどから利用)。
 */
export async function getStaffPunchesForMonth(params: {
  staffId: number;
  yearMonth: string;
}): Promise<MonthlyAttendanceRow[]> {
  const supabase = await createClient();
  const { staffId, yearMonth } = params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return [];

  const [year, month] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("time_records")
    .select("work_date, record_type, recorded_at")
    .eq("staff_id", staffId)
    .gte("work_date", start)
    .lt("work_date", end)
    .is("deleted_at", null)
    .order("recorded_at", { ascending: true });

  if (error) return [];
  return (data ?? []).map((r) => ({
    workDate: r.work_date as string,
    type: r.record_type as PunchType,
    recordedAt: r.recorded_at as string,
  }));
}
