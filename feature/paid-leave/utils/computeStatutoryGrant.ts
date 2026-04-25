/**
 * 労働基準法 39 条の有給休暇 法定付与日数。
 *
 * 入社 6 ヶ月後を初回付与基準日として 10 日。以降は基準日 (毎年同月日)
 * ごとに勤続年数に応じて付与:
 *   6ヶ月  -> 10 日
 *   1年6ヶ月 -> 11 日
 *   2年6ヶ月 -> 12 日
 *   3年6ヶ月 -> 14 日
 *   4年6ヶ月 -> 16 日
 *   5年6ヶ月 -> 18 日
 *   6年6ヶ月以降 -> 20 日 (上限)
 *
 * 出勤率 8 割の判定はここでは行わない (満たしている前提)。
 */
const STATUTORY_DAYS_BY_INDEX: number[] = [10, 11, 12, 14, 16, 18, 20];

export interface StatutoryGrantInfo {
  grantIndex: number; // 0 = 初回 (入社6ヶ月)
  grantedAt: Date;
  expiresAt: Date;
  days: number;
}

/**
 * 入社日から、指定基準日 (asOf) 時点で「付与済の最新 grant」を返す。
 * まだ初回付与日 (入社+6ヶ月) に達していない場合 null。
 */
export function computeLatestStatutoryGrant(
  hiredAt: Date,
  asOf: Date
): StatutoryGrantInfo | null {
  const firstGrant = addMonths(hiredAt, 6);
  if (asOf.getTime() < firstGrant.getTime()) return null;

  // (asOf - firstGrant) を年数で割り、何回目の付与日に到達しているか算出
  const yearsPassed = yearsBetween(firstGrant, asOf);
  const idx = Math.min(STATUTORY_DAYS_BY_INDEX.length - 1, Math.floor(yearsPassed));
  const grantedAt = addYears(firstGrant, idx);
  const expiresAt = addYears(grantedAt, 2);
  return {
    grantIndex: idx,
    grantedAt,
    expiresAt,
    days: STATUTORY_DAYS_BY_INDEX[idx],
  };
}

/**
 * 入社日から指定 asOf までに付与されているはずの全 grant を列挙する。
 * 既存テーブル (paid_leave_grants) との突合や、新規 staff 加入時の
 * 一括 backfill に使う。
 */
export function listStatutoryGrants(
  hiredAt: Date,
  asOf: Date
): StatutoryGrantInfo[] {
  const result: StatutoryGrantInfo[] = [];
  for (let i = 0; i < STATUTORY_DAYS_BY_INDEX.length; i++) {
    const granted = addYears(addMonths(hiredAt, 6), i);
    if (granted.getTime() > asOf.getTime()) break;
    const expiresAt = addYears(granted, 2);
    result.push({
      grantIndex: i,
      grantedAt: granted,
      expiresAt,
      days: STATUTORY_DAYS_BY_INDEX[i],
    });
  }
  // 6 年 6 ヶ月以降 (上限 20 日) — 入社 7.5 年・8.5 年 ... の付与も列挙
  const lastIdx = STATUTORY_DAYS_BY_INDEX.length - 1;
  for (let i = 1; ; i++) {
    const granted = addYears(addMonths(hiredAt, 6), lastIdx + i);
    if (granted.getTime() > asOf.getTime()) break;
    result.push({
      grantIndex: lastIdx + i,
      grantedAt: granted,
      expiresAt: addYears(granted, 2),
      days: STATUTORY_DAYS_BY_INDEX[lastIdx],
    });
  }
  return result;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function addYears(d: Date, n: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + n);
  return r;
}
function yearsBetween(from: Date, to: Date): number {
  return (
    (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 365.2425)
  );
}
