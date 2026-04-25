/**
 * 労働基準法に基づく残業代計算ユーティリティ。
 *
 * 法定割増率 (2026 年時点):
 *   - 法定時間外 (8h/日 or 40h/週 超過) … 1.25 倍
 *   - 法定休日労働 (週 1 日の法定休日)   … 1.35 倍
 *   - 深夜労働 (22:00-翌 5:00)          … 1.25 倍 (時間外と重複可)
 *   - 月 60 時間超の時間外労働          … 1.50 倍 (中小企業も適用済)
 *
 * このユーティリティは「打刻 (clock_in/out + 休憩) を分析して 1 ヶ月の
 * 区分別労働時間 (分) を返す」役割。実金額は呼び出し側で
 *   amount = baseHourlyWage * minutes / 60 * multiplier
 * のようにまとめる。
 */

export interface DayPunches {
  workDate: string; // YYYY-MM-DD
  clockIn: Date | null;
  clockOut: Date | null;
  breaks: { start: Date; end: Date }[];
  isLegalHoliday?: boolean; // 法定休日 (true なら 1.35 倍)
}

export interface OvertimeBreakdown {
  /** 通常勤務時間 (分) — 8h/日以内 + 40h/週以内 */
  regularMinutes: number;
  /** 法定時間外 (1.25倍) — 60h/月以内まで */
  overtimeMinutes: number;
  /** 月 60h 超過分 (1.5倍) */
  heavyOvertimeMinutes: number;
  /** 深夜 (1.25倍 加算)。時間外と重なる場合は別軸で計上 */
  nightMinutes: number;
  /** 法定休日労働 (1.35倍) */
  holidayMinutes: number;
}

const DAILY_LIMIT_MIN = 8 * 60;
const WEEKLY_LIMIT_MIN = 40 * 60;
const MONTHLY_OVERTIME_THRESHOLD_MIN = 60 * 60;
const NIGHT_START_HOUR = 22; // 22:00
const NIGHT_END_HOUR = 5; // 翌 5:00

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * 1 日の打刻からその日の労働時間 (分) と深夜時間 (分) を出す。
 * 休憩時間は控除する。
 */
function computeDayMinutes(d: DayPunches): {
  workMinutes: number;
  nightMinutes: number;
} {
  if (!d.clockIn || !d.clockOut) {
    return { workMinutes: 0, nightMinutes: 0 };
  }
  const start = d.clockIn.getTime();
  const end = d.clockOut.getTime();
  if (end <= start) return { workMinutes: 0, nightMinutes: 0 };

  let work = (end - start) / 60_000;
  let nightWork = computeNightOverlapMinutes(d.clockIn, d.clockOut);

  for (const br of d.breaks) {
    const bs = br.start.getTime();
    const be = br.end.getTime();
    if (be <= bs) continue;
    const overlap = clamp((Math.min(be, end) - Math.max(bs, start)) / 60_000, 0, Infinity);
    work -= overlap;
    nightWork -= computeNightOverlapMinutes(
      new Date(Math.max(bs, start)),
      new Date(Math.min(be, end))
    );
  }
  return {
    workMinutes: Math.max(0, Math.round(work)),
    nightMinutes: Math.max(0, Math.round(nightWork)),
  };
}

/**
 * 22:00-5:00 (Asia/Tokyo) の重なり (分) を出す。
 * 日跨ぎを避けるため、開始日の 22:00 〜 翌日の 5:00 を区間として
 * 各日ごとに切って計算する。
 */
function computeNightOverlapMinutes(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;
  let total = 0;
  // 開始日の 22:00〜翌 5:00、翌日の 22:00〜翌々 5:00 ... を順に評価
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < end.getTime()) {
    const nightStart = new Date(cursor);
    nightStart.setHours(NIGHT_START_HOUR, 0, 0, 0);
    const nightEnd = new Date(cursor);
    nightEnd.setDate(nightEnd.getDate() + 1);
    nightEnd.setHours(NIGHT_END_HOUR, 0, 0, 0);
    const ovStart = Math.max(start.getTime(), nightStart.getTime());
    const ovEnd = Math.min(end.getTime(), nightEnd.getTime());
    if (ovEnd > ovStart) total += (ovEnd - ovStart) / 60_000;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(total);
}

/**
 * 月単位で残業区分を集計する。
 *
 * 入力: 1 ヶ月分の日別打刻配列。
 *   - 法定休日扱いの日は isLegalHoliday=true (運用で決める。デフォルト false)
 *   - 週の起算は日曜日 (ISO 月曜起算ではなく、日本の労務実務に揃える)
 */
export function computeMonthlyOvertime(days: DayPunches[]): OvertimeBreakdown {
  const result: OvertimeBreakdown = {
    regularMinutes: 0,
    overtimeMinutes: 0,
    heavyOvertimeMinutes: 0,
    nightMinutes: 0,
    holidayMinutes: 0,
  };

  // 週ごとに集計するため、workDate を Date に変換しソート
  const sorted = [...days].sort((a, b) => a.workDate.localeCompare(b.workDate));

  // 週累計 (月内で日曜起算リセット)
  let weeklyMin = 0;
  let lastWeekKey = "";

  // 月時間外累計 (60h 閾値判定用)
  let monthlyOvertimeMin = 0;

  for (const d of sorted) {
    const { workMinutes, nightMinutes } = computeDayMinutes(d);
    if (workMinutes === 0) continue;

    const dt = new Date(`${d.workDate}T00:00:00+09:00`);
    const sunday = new Date(dt);
    sunday.setDate(dt.getDate() - dt.getDay()); // 日曜起算
    const weekKey = sunday.toISOString().slice(0, 10);
    if (weekKey !== lastWeekKey) {
      weeklyMin = 0;
      lastWeekKey = weekKey;
    }

    if (d.isLegalHoliday) {
      // 法定休日労働: 全時間が 1.35 倍 (深夜部分は別途加算可能だが、本実装では holiday に集約)
      result.holidayMinutes += workMinutes;
      result.nightMinutes += nightMinutes;
      continue;
    }

    // 1 日 8h 超過分は時間外
    const dailyOver = Math.max(0, workMinutes - DAILY_LIMIT_MIN);
    let dailyRegular = workMinutes - dailyOver;

    // 週合計が 40h を超えた分は時間外 (日次 8h 超過とは独立に判定し、
    // 大きい方を採用) — ここでは「日次 + 週次の差分」をシンプルに加算
    const newWeekly = weeklyMin + dailyRegular;
    let weeklyOver = 0;
    if (newWeekly > WEEKLY_LIMIT_MIN) {
      weeklyOver = Math.min(dailyRegular, newWeekly - WEEKLY_LIMIT_MIN);
      dailyRegular -= weeklyOver;
    }
    weeklyMin = Math.min(WEEKLY_LIMIT_MIN, newWeekly);

    const overtimeToday = dailyOver + weeklyOver;

    // 60h 超は heavy にスライド
    const overtimeBefore = monthlyOvertimeMin;
    monthlyOvertimeMin += overtimeToday;
    let regularOver = overtimeToday;
    let heavyOver = 0;
    if (monthlyOvertimeMin > MONTHLY_OVERTIME_THRESHOLD_MIN) {
      const excess = monthlyOvertimeMin - MONTHLY_OVERTIME_THRESHOLD_MIN;
      heavyOver = Math.min(overtimeToday, excess);
      regularOver = overtimeToday - heavyOver;
    }
    void overtimeBefore;

    result.regularMinutes += dailyRegular;
    result.overtimeMinutes += regularOver;
    result.heavyOvertimeMinutes += heavyOver;
    result.nightMinutes += nightMinutes;
  }

  return result;
}

/**
 * 区分別の残業代金額を計算する (時給ベース)。
 * 深夜は時間外と重複しうるが、ここでは「割増の合算 (1.25 + 0.25 = 1.5
 * 倍 等)」ではなく、深夜は別途 0.25 倍を時間外労働額に上乗せする
 * 実装としている (実務でよく使われる方式)。
 */
export function computeOvertimeAmounts(
  hourlyWage: number,
  br: OvertimeBreakdown
): {
  regular: number;
  overtime: number;
  heavyOvertime: number;
  night: number;
  holiday: number;
  total: number;
} {
  const wagePerMin = hourlyWage / 60;
  const regular = Math.round(wagePerMin * br.regularMinutes);
  const overtime = Math.round(wagePerMin * 1.25 * br.overtimeMinutes);
  const heavyOvertime = Math.round(wagePerMin * 1.5 * br.heavyOvertimeMinutes);
  // 深夜割増 0.25 倍 (基本給 1 倍に加える運用が多い)
  const night = Math.round(wagePerMin * 0.25 * br.nightMinutes);
  const holiday = Math.round(wagePerMin * 1.35 * br.holidayMinutes);
  return {
    regular,
    overtime,
    heavyOvertime,
    night,
    holiday,
    total: regular + overtime + heavyOvertime + night + holiday,
  };
}
