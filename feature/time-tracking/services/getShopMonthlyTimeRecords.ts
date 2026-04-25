"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface DailySummaryRow {
  staffId: number;
  staffName: string;
  workDate: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  workMinutes: number;
  breakMinutes: number;
}

/**
 * 店舗 × 月の勤務サマリー (スタッフ × 日付ごと)。
 *
 * - 出勤 (clock_in) / 退勤 (clock_out) / 休憩 (break_*) を取り出して
 *   ペアリングし、勤務時間 (分) と休憩時間 (分) を出す。
 * - 同日に複数回の出勤がある場合は最初の clock_in と最後の clock_out。
 */
export async function getShopMonthlyTimeRecords(params: {
  shopId: number;
  yearMonth: string;
}): Promise<DailySummaryRow[]> {
  const supabase = await createClient();
  const { shopId, yearMonth } = params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return [];

  const [year, month] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  const [staffRes, recordsRes] = await Promise.all([
    supabase
      .from("staffs")
      .select("id, name")
      .eq("shop_id", shopId)
      .is("deleted_at", null),
    supabase
      .from("time_records")
      .select("staff_id, record_type, recorded_at, work_date")
      .eq("shop_id", shopId)
      .gte("work_date", start)
      .lt("work_date", end)
      .is("deleted_at", null)
      .order("recorded_at", { ascending: true }),
  ]);

  if (recordsRes.error) {
    // table 不在なら空
    return [];
  }

  const staffById = new Map<number, string>();
  for (const s of staffRes.data ?? []) {
    staffById.set(s.id as number, s.name as string);
  }

  // grouping: key = staffId|workDate
  type Bucket = {
    staffId: number;
    workDate: string;
    clockIn: string | null;
    clockOut: string | null;
    breaks: { start: string; end: string | null }[];
  };
  const groups = new Map<string, Bucket>();
  const ensure = (sid: number, wd: string) => {
    const k = `${sid}|${wd}`;
    if (!groups.has(k)) {
      groups.set(k, {
        staffId: sid,
        workDate: wd,
        clockIn: null,
        clockOut: null,
        breaks: [],
      });
    }
    return groups.get(k)!;
  };

  for (const r of recordsRes.data ?? []) {
    const sid = r.staff_id as number;
    const wd = r.work_date as string;
    const at = r.recorded_at as string;
    const t = r.record_type as string;
    const b = ensure(sid, wd);
    if (t === "clock_in") {
      if (!b.clockIn) b.clockIn = at;
    } else if (t === "clock_out") {
      b.clockOut = at; // 上書きで最新
    } else if (t === "break_start") {
      b.breaks.push({ start: at, end: null });
    } else if (t === "break_end") {
      const last = b.breaks[b.breaks.length - 1];
      if (last && last.end == null) last.end = at;
    }
  }

  const rows: DailySummaryRow[] = [];
  for (const b of groups.values()) {
    let workMinutes = 0;
    let breakMinutes = 0;
    if (b.clockIn && b.clockOut) {
      workMinutes = Math.round(
        (new Date(b.clockOut).getTime() - new Date(b.clockIn).getTime()) / 60000
      );
    }
    for (const br of b.breaks) {
      if (br.start && br.end) {
        breakMinutes += Math.round(
          (new Date(br.end).getTime() - new Date(br.start).getTime()) / 60000
        );
      }
    }
    workMinutes = Math.max(0, workMinutes - breakMinutes);
    rows.push({
      staffId: b.staffId,
      staffName: staffById.get(b.staffId) ?? `Staff ${b.staffId}`,
      workDate: b.workDate,
      clockInAt: b.clockIn,
      clockOutAt: b.clockOut,
      workMinutes,
      breakMinutes,
    });
  }
  rows.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.staffName.localeCompare(b.staffName, "ja")
  );
  return rows;
}
