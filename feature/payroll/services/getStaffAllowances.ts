"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * 諸手当 (Phase 2) の月次集計。
 *
 * 対象 6 種:
 *   - children      : 子供 1 人 × 5,000 円 (条件なし)
 *   - birthday      : 誕生月のみ 10,000 円 (全員)
 *   - health        : 税込売上 ≥ 100 万 のとき 10,000 円 (繰越不可)
 *   - housing       : 税込売上 ≥ 100 万 のとき 20,000 円 (繰越不可、業務委託・正社員問わず)
 *   - study         : 税込売上 ≥ 100 万 のとき 10,000 円 付与 (繰越可、12月リセット)
 *   - event_access  : 同上
 *
 * 「繰越あり」(study / event_access) は accrued (累積付与額) と used
 * (累積使用額) を年単位で計算し、balance を返す。usage は allowance_usage
 * テーブルに DB 行で記録、accrual は売上から都度算出する (DB 行なし)。
 */

export type CarryoverAllowanceType = "study" | "event_access";

export interface AllowanceSummary {
  // 当月分の自動付与額 (¥)
  childrenAmount: number;
  birthdayAmount: number;
  healthAmount: number;
  housingAmount: number;
  // 繰越手当の年内累積 (Jan〜表示月) と残枠
  study: CarryoverState;
  eventAccess: CarryoverState;
  // 当月の手当合計 (繰越分は当月の付与額 + 当月の使用額を含む)。
  // 請求書出力 (Phase 4) で使う。
  monthlyTotal: number;
  // この月に勉強 / イベントアクセス手当が付与されたか (sales ≥ 100 万を満たしたか)
  carryoverAccrualThisMonth: boolean;
  // 売上判定の元データ
  salesInclTax: number;
  isSalesAboveThreshold: boolean;
}

export interface CarryoverState {
  accruedYearToDate: number; // 年初〜表示月までの累積付与額
  usedYearToDate: number;    // 年初〜表示月までの累積使用額
  balance: number;           // 残枠 = 累積付与額 − 累積使用額
  usedThisMonth: number;     // 当月内の使用額 (請求書計上用)
}

const HEALTH_AMOUNT = 10000;
const HOUSING_AMOUNT = 20000;
// 勉強 / イベントアクセスは同条件・同金額なので 1 定数で兼用
const CARRYOVER_ACCRUAL_AMOUNT = 10000;
const CHILD_AMOUNT = 5000;
const BIRTHDAY_AMOUNT = 10000;
const SALES_THRESHOLD_INCL_TAX = 1_000_000;

/**
 * 1 スタッフの当月手当サマリを返す。
 */
export async function getStaffAllowanceSummary(params: {
  staffId: number;
  shopId: number;
  yearMonth: string; // 'YYYY-MM'
  // 既に呼び出し元で staff レコード + 当月売上を持っている場合は渡せる
  // (給与計算ページの一覧行など)。無ければ内部で取得する。
  prefetched?: {
    childrenCount: number;
    birthday: string | null;
    salesInclTax: number;
  };
}): Promise<AllowanceSummary> {
  const supabase = await createClient();
  const { staffId, shopId, yearMonth, prefetched } = params;

  const [year, month] = yearMonth.split("-").map(Number);

  // staff + 当月売上の取得
  let childrenCount = prefetched?.childrenCount ?? 0;
  let birthday = prefetched?.birthday ?? null;
  let salesInclTax = prefetched?.salesInclTax ?? 0;

  if (!prefetched) {
    const staffRes = await supabase
      .from("staffs")
      .select("children_count, birthday")
      .eq("id", staffId)
      .maybeSingle();
    if (staffRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = staffRes.data;
      childrenCount = (s.children_count as number) ?? 0;
      birthday = (s.birthday as string | null) ?? null;
    }

    const startTs = `${yearMonth}-01T00:00:00+09:00`;
    const nextY = month === 12 ? year + 1 : year;
    const nextM = month === 12 ? 1 : month + 1;
    const endTs = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;
    const { data: appts } = await supabase
      .from("appointments")
      .select("sales")
      .eq("shop_id", shopId)
      .eq("staff_id", staffId)
      .eq("status", 2)
      .gte("start_at", startTs)
      .lt("start_at", endTs)
      .is("deleted_at", null);
    salesInclTax = (appts ?? []).reduce(
      (s, a) => s + ((a.sales as number | null) ?? 0),
      0
    );
  }

  const isSalesAboveThreshold = salesInclTax >= SALES_THRESHOLD_INCL_TAX;
  const childrenAmount = childrenCount * CHILD_AMOUNT;

  // 誕生月判定: 誕生日の月部分が表示月と一致したら付与
  let birthdayAmount = 0;
  if (birthday) {
    const bMonth = Number(birthday.slice(5, 7));
    if (Number.isFinite(bMonth) && bMonth === month) {
      birthdayAmount = BIRTHDAY_AMOUNT;
    }
  }

  const healthAmount = isSalesAboveThreshold ? HEALTH_AMOUNT : 0;
  const housingAmount = isSalesAboveThreshold ? HOUSING_AMOUNT : 0;

  // 繰越手当: 年初〜表示月までの月次売上をスタッフ単位で集計し、
  // 1M 以上の月数 × 10000 を累積付与額とする。
  const yearStart = `${year}-01-01T00:00:00+09:00`;
  // 表示月の翌月初まで (含む表示月)
  const accrualEndY = month === 12 ? year + 1 : year;
  const accrualEndM = month === 12 ? 1 : month + 1;
  const accrualEndTs = `${accrualEndY}-${String(accrualEndM).padStart(2, "0")}-01T00:00:00+09:00`;

  const { data: yearAppts } = await supabase
    .from("appointments")
    .select("start_at, sales")
    .eq("shop_id", shopId)
    .eq("staff_id", staffId)
    .eq("status", 2)
    .gte("start_at", yearStart)
    .lt("start_at", accrualEndTs)
    .is("deleted_at", null);

  // 月単位に集計
  const salesByMonth = new Map<string, number>();
  for (const a of yearAppts ?? []) {
    const ym = (a.start_at as string).slice(0, 7);
    salesByMonth.set(
      ym,
      (salesByMonth.get(ym) ?? 0) + ((a.sales as number | null) ?? 0)
    );
  }
  let accrualMonths = 0;
  for (const v of salesByMonth.values()) {
    if (v >= SALES_THRESHOLD_INCL_TAX) accrualMonths += 1;
  }
  const carryoverAccruedYTD = accrualMonths * CARRYOVER_ACCRUAL_AMOUNT;

  // 使用記録 (allowance_usage) を年で集計。table 不在環境でも落ちない
  // よう、エラー時は使用 0 として扱う。
  let usedStudyYTD = 0;
  let usedEventYTD = 0;
  let usedStudyThisMonth = 0;
  let usedEventThisMonth = 0;
  const usageRes = await supabase
    .from("allowance_usage")
    .select("allowance_type, year_month, amount")
    .eq("staff_id", staffId)
    .eq("year", year)
    .is("deleted_at", null);
  if (!usageRes.error) {
    for (const u of usageRes.data ?? []) {
      const t = u.allowance_type as CarryoverAllowanceType;
      const amt = (u.amount as number) ?? 0;
      const ym = u.year_month as string;
      if (t === "study") {
        usedStudyYTD += amt;
        if (ym === yearMonth) usedStudyThisMonth += amt;
      } else if (t === "event_access") {
        usedEventYTD += amt;
        if (ym === yearMonth) usedEventThisMonth += amt;
      }
    }
  }

  const study: CarryoverState = {
    accruedYearToDate: carryoverAccruedYTD,
    usedYearToDate: usedStudyYTD,
    balance: Math.max(0, carryoverAccruedYTD - usedStudyYTD),
    usedThisMonth: usedStudyThisMonth,
  };
  const eventAccess: CarryoverState = {
    accruedYearToDate: carryoverAccruedYTD, // 同条件で同額 (= study と同じ)
    usedYearToDate: usedEventYTD,
    balance: Math.max(0, carryoverAccruedYTD - usedEventYTD),
    usedThisMonth: usedEventThisMonth,
  };

  // 当月の請求合計 = 自動付与 + 繰越手当の当月使用額
  const monthlyTotal =
    childrenAmount +
    birthdayAmount +
    healthAmount +
    housingAmount +
    usedStudyThisMonth +
    usedEventThisMonth;

  return {
    childrenAmount,
    birthdayAmount,
    healthAmount,
    housingAmount,
    study,
    eventAccess,
    monthlyTotal,
    carryoverAccrualThisMonth: isSalesAboveThreshold,
    salesInclTax,
    isSalesAboveThreshold,
  };
}
