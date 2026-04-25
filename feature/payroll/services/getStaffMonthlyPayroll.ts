"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getCompensationTiers, type CompensationTier } from "./getCompensationTiers";
import type {
  EmploymentType,
  StaffMonthlyCompensation,
} from "./getStaffMonthlyCompensation";
import type { AllowanceSummary, CarryoverState } from "./getStaffAllowances";
import { CLAIM_CODES, type AllowanceCode } from "../allowanceTypes";

/**
 * /payroll の一覧表示用に「業務委託費 + 諸手当 + 合計」を 1 回のクエリ
 * バッチで集計する。
 *
 * Phase 1 の getStaffMonthlyCompensationForShop と Phase 2 の
 * getStaffAllowanceSummary を組み合わせた版で、N+1 を避けて per-staff
 * の集計を in-memory で完結させる。
 *
 * クエリ:
 *   1. staffs (shop)
 *   2. appointments (shop, year_start..month_end)  — 当月分 + 年累積分
 *   3. compensation_tiers (brand)
 *   4. allowance_usage (year, all staff in shop)
 */

export interface StaffMonthlyPayrollRow extends StaffMonthlyCompensation {
  allowances: AllowanceSummary;
  // claim 型手当の当月使用額 (allowance_code → 当月使用額の合計)。
  // 美容 / 家族 / 通勤 / 宿泊 / 紹介 / リクルート / 健康診断 / 引越し / 歯科 が対象。
  claimAllowanceUsage: Record<string, number>;
  claimAllowanceTotal: number;
  // 月の支払予定総額 (税込) = 業務委託費 + 諸手当 (auto + carryover 当月使用 + claim)
  totalInclTax: number;
}

const HEALTH_AMOUNT = 10000;
const HOUSING_AMOUNT = 20000;
const STUDY_AMOUNT = 10000;
const CHILD_AMOUNT = 5000;
const BIRTHDAY_AMOUNT = 10000;
const SALES_THRESHOLD = 1_000_000;

export async function getStaffMonthlyPayrollForShop(params: {
  shopId: number;
  brandId: number;
  yearMonth: string;
}): Promise<StaffMonthlyPayrollRow[]> {
  const supabase = await createClient();
  const { shopId, brandId, yearMonth } = params;
  const [year, month] = yearMonth.split("-").map(Number);

  // 期間: 年初 〜 表示月の翌月初 (含む表示月)
  const yearStart = `${year}-01-01T00:00:00+09:00`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  const [staffRes, apptRes, tiers, usageRes] = await Promise.all([
    fetchStaffsRobust(supabase, shopId),
    supabase
      .from("appointments")
      .select("staff_id, start_at, sales")
      .eq("shop_id", shopId)
      .eq("status", 2)
      .gte("start_at", yearStart)
      .lt("start_at", monthEnd)
      .is("deleted_at", null),
    getCompensationTiers(brandId),
    fetchUsageRobust(supabase, shopId, year),
  ]);

  // 売上: staff_id × month で集計
  const salesByStaffMonth = new Map<string, number>(); // key = `${staffId}:${YYYY-MM}`
  for (const a of apptRes.data ?? []) {
    const sid = a.staff_id as number;
    const ym = (a.start_at as string).slice(0, 7);
    const key = `${sid}:${ym}`;
    salesByStaffMonth.set(
      key,
      (salesByStaffMonth.get(key) ?? 0) + ((a.sales as number | null) ?? 0)
    );
  }

  // 使用記録: staff_id × type × YTD / this_month
  type Used = { ytd: number; thisMonth: number };
  const usedByStaff = new Map<
    number,
    {
      study: Used;
      event: Used;
      // claim 型 (美容 / 家族 / 通勤 / ...) の当月使用額
      claimByCode: Map<AllowanceCode, number>;
    }
  >();
  const ensure = (sid: number) => {
    if (!usedByStaff.has(sid)) {
      usedByStaff.set(sid, {
        study: { ytd: 0, thisMonth: 0 },
        event: { ytd: 0, thisMonth: 0 },
        claimByCode: new Map(),
      });
    }
    return usedByStaff.get(sid)!;
  };
  const claimSet = new Set<string>(CLAIM_CODES);
  for (const u of usageRes) {
    const bucket = ensure(u.staff_id);
    if (u.allowance_type === "study") {
      bucket.study.ytd += u.amount;
      if (u.year_month === yearMonth) bucket.study.thisMonth += u.amount;
    } else if (u.allowance_type === "event_access") {
      bucket.event.ytd += u.amount;
      if (u.year_month === yearMonth) bucket.event.thisMonth += u.amount;
    } else if (claimSet.has(u.allowance_type)) {
      // claim 型は当月使用額のみ集計 (繰越なし)
      if (u.year_month === yearMonth) {
        const code = u.allowance_type as AllowanceCode;
        bucket.claimByCode.set(
          code,
          (bucket.claimByCode.get(code) ?? 0) + u.amount
        );
      }
    }
  }

  return staffRes.map((s) =>
    computePayrollRow({
      staff: s,
      month,
      salesInclTaxThisMonth: salesByStaffMonth.get(`${s.id}:${yearMonth}`) ?? 0,
      salesAccrualMonths: countAccrualMonths(salesByStaffMonth, s.id, year, month),
      tiers,
      used: usedByStaff.get(s.id) ?? {
        study: { ytd: 0, thisMonth: 0 },
        event: { ytd: 0, thisMonth: 0 },
        claimByCode: new Map(),
      },
    })
  );
}

interface StaffRow {
  id: number;
  name: string;
  employment_type: EmploymentType;
  hired_at: string | null;
  birthday: string | null;
  children_count: number;
  monthly_min_salary: number;
}

interface UsageRow {
  staff_id: number;
  // study / event_access (carryover) + claim 型 (Phase 2.5)
  allowance_type: AllowanceCode | string;
  year_month: string;
  amount: number;
}

async function fetchStaffsRobust(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: number
): Promise<StaffRow[]> {
  const full = await supabase
    .from("staffs")
    .select(
      "id, name, employment_type, hired_at, birthday, children_count, monthly_min_salary"
    )
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("allocate_order", { ascending: true, nullsFirst: false });
  if (!full.error) {
    return (full.data ?? []).map((r) => ({
      id: r.id as number,
      name: r.name as string,
      employment_type: ((r.employment_type as string) ?? "contractor") as EmploymentType,
      hired_at: (r.hired_at as string | null) ?? null,
      birthday: (r.birthday as string | null) ?? null,
      children_count: (r.children_count as number) ?? 0,
      monthly_min_salary: (r.monthly_min_salary as number) ?? 260000,
    }));
  }
  // migration 00031 未適用フォールバック
  const fallback = await supabase
    .from("staffs")
    .select("id, name")
    .eq("shop_id", shopId)
    .is("deleted_at", null);
  return (fallback.data ?? []).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    employment_type: "contractor" as EmploymentType,
    hired_at: null,
    birthday: null,
    children_count: 0,
    monthly_min_salary: 260000,
  }));
}

async function fetchUsageRobust(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: number,
  year: number
): Promise<UsageRow[]> {
  // shop 内のスタッフ id だけ事前に絞ると IN 句が肥大するので、
  // year で絞った全行を取り、shopId フィルタは staffs join 不要なら省略。
  // Phase 2 段階では allowance_usage は staff_id しか持たないため、
  // 結合無しで year のみ絞る (1 年あたり数百行想定)。
  const res = await supabase
    .from("allowance_usage")
    .select("staff_id, allowance_type, year_month, amount")
    .eq("year", year)
    .is("deleted_at", null);
  if (res.error) {
    // table 不在 → 空扱い
    return [];
  }
  // shopId フィルタは staff_id がそもそも staffs in shop なら自動的に
  // 絞れる (上の staffsRes と join するわけではないが、計算ループで
  // 該当スタッフだけ集計するので問題なし)。一応 shop_id ベース絞り込みを
  // 別途やりたければここで staffs に JOIN する。
  void shopId;
  return (res.data ?? []).map((r) => ({
    staff_id: r.staff_id as number,
    allowance_type: r.allowance_type as string,
    year_month: r.year_month as string,
    amount: (r.amount as number) ?? 0,
  }));
}

function countAccrualMonths(
  salesByStaffMonth: Map<string, number>,
  staffId: number,
  year: number,
  upToMonth: number
): number {
  let cnt = 0;
  for (let m = 1; m <= upToMonth; m++) {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    const sales = salesByStaffMonth.get(`${staffId}:${ym}`) ?? 0;
    if (sales >= SALES_THRESHOLD) cnt += 1;
  }
  return cnt;
}

function computePayrollRow(args: {
  staff: StaffRow;
  month: number;
  salesInclTaxThisMonth: number;
  salesAccrualMonths: number;
  tiers: CompensationTier[];
  used: {
    study: { ytd: number; thisMonth: number };
    event: { ytd: number; thisMonth: number };
    claimByCode: Map<AllowanceCode, number>;
  };
}): StaffMonthlyPayrollRow {
  const { staff, month, salesInclTaxThisMonth, salesAccrualMonths, tiers, used } = args;

  // ----- 業務委託費 (Phase 1 と同じ式) -----
  const salesExclTax = Math.round(salesInclTaxThisMonth / 1.1);
  const isRegular = staff.employment_type === "regular";
  let appliedPercentage: number | null = null;
  let compensationInclTax = 0;
  if (!isRegular) {
    const matched = [...tiers].reverse().find((t) => salesExclTax >= t.salesThreshold);
    if (matched) {
      appliedPercentage = matched.percentage;
      const tierBased = Math.round((salesExclTax * matched.percentage) / 100);
      compensationInclTax = Math.max(staff.monthly_min_salary, tierBased);
    } else {
      compensationInclTax = staff.monthly_min_salary;
    }
  }
  const compensationExclTax = isRegular
    ? 0
    : Math.round(compensationInclTax / 1.1);

  // ----- 諸手当 (Phase 2) -----
  const isSalesAboveThreshold = salesInclTaxThisMonth >= SALES_THRESHOLD;
  const childrenAmount = staff.children_count * CHILD_AMOUNT;

  let birthdayAmount = 0;
  if (staff.birthday) {
    const bMonth = Number(staff.birthday.slice(5, 7));
    if (Number.isFinite(bMonth) && bMonth === month) {
      birthdayAmount = BIRTHDAY_AMOUNT;
    }
  }

  const healthAmount = isSalesAboveThreshold ? HEALTH_AMOUNT : 0;
  // 住宅手当は業務委託・正社員問わず付与
  const housingAmount = isSalesAboveThreshold ? HOUSING_AMOUNT : 0;

  // 繰越手当: 累積付与 = 1M 達成月数 × 10000 (study / event 共通条件)
  const carryoverAccruedYTD = salesAccrualMonths * STUDY_AMOUNT;
  const study: CarryoverState = {
    accruedYearToDate: carryoverAccruedYTD,
    usedYearToDate: used.study.ytd,
    balance: Math.max(0, carryoverAccruedYTD - used.study.ytd),
    usedThisMonth: used.study.thisMonth,
  };
  const eventAccess: CarryoverState = {
    accruedYearToDate: carryoverAccruedYTD,
    usedYearToDate: used.event.ytd,
    balance: Math.max(0, carryoverAccruedYTD - used.event.ytd),
    usedThisMonth: used.event.thisMonth,
  };

  // claim 型 (美容 / 家族 / 通勤 / 宿泊 / 紹介 / リクルート / 健康診断 /
  // 引越し / 歯科) の当月使用額を Record にまとめて、合計も出す。
  const claimAllowanceUsage: Record<string, number> = {};
  let claimAllowanceTotal = 0;
  for (const [code, amt] of used.claimByCode.entries()) {
    claimAllowanceUsage[code] = amt;
    claimAllowanceTotal += amt;
  }

  const monthlyAllowanceTotal =
    childrenAmount +
    birthdayAmount +
    healthAmount +
    housingAmount +
    used.study.thisMonth +
    used.event.thisMonth +
    claimAllowanceTotal;

  const allowances: AllowanceSummary = {
    childrenAmount,
    birthdayAmount,
    healthAmount,
    housingAmount,
    study,
    eventAccess,
    monthlyTotal: monthlyAllowanceTotal,
    carryoverAccrualThisMonth: isSalesAboveThreshold,
    salesInclTax: salesInclTaxThisMonth,
    isSalesAboveThreshold,
  };

  const totalInclTax = compensationInclTax + monthlyAllowanceTotal;

  return {
    staffId: staff.id,
    staffName: staff.name,
    employmentType: staff.employment_type,
    hiredAt: staff.hired_at,
    birthday: staff.birthday,
    childrenCount: staff.children_count,
    monthlyMinSalary: staff.monthly_min_salary,
    salesInclTax: salesInclTaxThisMonth,
    salesExclTax,
    appliedPercentage,
    compensationInclTax,
    compensationExclTax,
    allowances,
    claimAllowanceUsage,
    claimAllowanceTotal,
    totalInclTax,
  };
}
