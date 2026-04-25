"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getCompensationTiers, type CompensationTier } from "./getCompensationTiers";

export type EmploymentType = "contractor" | "regular";

export interface StaffMonthlyCompensation {
  staffId: number;
  staffName: string;
  employmentType: EmploymentType;
  hiredAt: string | null;
  birthday: string | null;
  childrenCount: number;
  monthlyMinSalary: number;       // 月次最低保証額 (税込)
  salesInclTax: number;           // 売上 (税込)
  salesExclTax: number;           // 売上 (税抜)
  appliedPercentage: number | null; // tier 適用 %、未該当 (最低保証適用) は null
  compensationInclTax: number;    // 業務委託費 (税込)
  compensationExclTax: number;    // 業務委託費 (税抜)
}

/**
 * Phase 1 の業務委託費計算。
 *
 * sales = `appointments.sales` (status=2 完了予約のみ) を staff_id で集約。
 * 現状 sales カラムは「店頭で受け取った金額 (=税込)」として運用されている
 * 前提で、税抜換算は `÷ 1.1` で算出する。Phase 6 で消費税フラグを正規化。
 *
 * 報酬計算:
 *   compensation_税込 = max(monthly_min_salary, sales_税抜 × tier_pct)
 *   compensation_税抜 = round(compensation_税込 / 1.1)
 *
 * 正社員 (employment_type='regular') は計算対象外。Phase 6 で給与計算が
 * 入るまで appliedPercentage / compensation* は 0 を返し、UI 側で
 * 「給与計算未対応」と表示する。
 */
export async function getStaffMonthlyCompensationForShop(params: {
  shopId: number;
  brandId: number;
  yearMonth: string; // 'YYYY-MM'
}): Promise<StaffMonthlyCompensation[]> {
  const supabase = await createClient();
  const { shopId, brandId, yearMonth } = params;

  // 月の開始 / 翌月開始 (JST)
  const startTs = `${yearMonth}-01T00:00:00+09:00`;
  const [y, m] = yearMonth.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const endTs = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  // staffs / appointments / tiers を並列取得。
  // staffs は migration 00031 未適用の環境でも落ちないよう、最小カラムで
  // フェッチして例外時は基本カラムのみのフォールバックを試みる。
  const [staffRes, apptRes, tiers] = await Promise.all([
    fetchStaffsWithFallback(supabase, shopId),
    supabase
      .from("appointments")
      .select("staff_id, sales")
      .eq("shop_id", shopId)
      .eq("status", 2)
      .gte("start_at", startTs)
      .lt("start_at", endTs)
      .is("deleted_at", null),
    getCompensationTiers(brandId),
  ]);

  const salesByStaff = new Map<number, number>();
  for (const a of apptRes.data ?? []) {
    const sid = a.staff_id as number;
    const s = (a.sales as number | null) ?? 0;
    salesByStaff.set(sid, (salesByStaff.get(sid) ?? 0) + s);
  }

  return staffRes.map((s) =>
    computeRow(s, salesByStaff.get(s.id) ?? 0, tiers)
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

async function fetchStaffsWithFallback(
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
  // migration 00031 未適用 → 既存カラムだけで取り、デフォルト値で埋める
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

function computeRow(
  s: StaffRow,
  salesInclTax: number,
  tiers: CompensationTier[]
): StaffMonthlyCompensation {
  // sales カラムは税込前提 → 税抜換算
  const salesExclTax = Math.round(salesInclTax / 1.1);
  const isRegular = s.employment_type === "regular";

  let appliedPercentage: number | null = null;
  let compensationInclTax = 0;

  if (!isRegular) {
    // tier の中から sales_threshold ≤ salesExclTax を満たす最大の閾値を引く
    const matched = [...tiers]
      .reverse()
      .find((t) => salesExclTax >= t.salesThreshold);
    if (matched) {
      appliedPercentage = matched.percentage;
      const tierBased = Math.round((salesExclTax * matched.percentage) / 100);
      compensationInclTax = Math.max(s.monthly_min_salary, tierBased);
    } else {
      // 800k 未満 → 最低保証のみ
      compensationInclTax = s.monthly_min_salary;
    }
  }
  const compensationExclTax = isRegular
    ? 0
    : Math.round(compensationInclTax / 1.1);

  return {
    staffId: s.id,
    staffName: s.name,
    employmentType: s.employment_type,
    hiredAt: s.hired_at,
    birthday: s.birthday,
    childrenCount: s.children_count,
    monthlyMinSalary: s.monthly_min_salary,
    salesInclTax,
    salesExclTax,
    appliedPercentage,
    compensationInclTax,
    compensationExclTax,
  };
}
