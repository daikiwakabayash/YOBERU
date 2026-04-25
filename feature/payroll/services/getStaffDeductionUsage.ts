"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { DeductionCode } from "../deductionTypes";

export interface DeductionUsageRow {
  id: number;
  deductionType: DeductionCode;
  yearMonth: string;
  amount: number;
  note: string | null;
}

/**
 * 当年のスタッフ控除使用記録を取得 (table 不在ならフォールバックで空配列)。
 */
export async function getStaffDeductionUsage(params: {
  staffId: number;
  year: number;
}): Promise<DeductionUsageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deduction_usage")
    .select("id, deduction_type, year_month, amount, note")
    .eq("staff_id", params.staffId)
    .eq("year", params.year)
    .is("deleted_at", null)
    .order("year_month", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("deduction_usage") ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((r) => ({
    id: r.id as number,
    deductionType: r.deduction_type as DeductionCode,
    yearMonth: r.year_month as string,
    amount: (r.amount as number) ?? 0,
    note: (r.note as string | null) ?? null,
  }));
}

/**
 * 指定店舗の全スタッフ × 当月控除合計を Map<staff_id, sumAmount> で返す。
 * /payroll の一覧画面で「控除込みの差引支給額」を出すために使う。
 */
export async function getDeductionTotalsByStaffForMonth(params: {
  shopId: number;
  yearMonth: string;
}): Promise<Map<number, number>> {
  const supabase = await createClient();
  const result = new Map<number, number>();

  // staff_id はテーブル間 join なしで shop でフィルタするため、
  // 一旦 shop 内の staff id を取得して in 句で絞る。
  const staffRes = await supabase
    .from("staffs")
    .select("id")
    .eq("shop_id", params.shopId)
    .is("deleted_at", null);
  const staffIds = (staffRes.data ?? []).map((r) => r.id as number);
  if (staffIds.length === 0) return result;

  const { data, error } = await supabase
    .from("deduction_usage")
    .select("staff_id, amount")
    .in("staff_id", staffIds)
    .eq("year_month", params.yearMonth)
    .is("deleted_at", null);

  if (error) {
    return result;
  }

  for (const r of data ?? []) {
    const sid = r.staff_id as number;
    result.set(sid, (result.get(sid) ?? 0) + ((r.amount as number) ?? 0));
  }
  return result;
}
