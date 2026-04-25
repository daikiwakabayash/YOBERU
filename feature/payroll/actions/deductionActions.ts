"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { DEDUCTION_BY_CODE, type DeductionCode } from "../deductionTypes";

const VALID_CODES = new Set<string>(Object.keys(DEDUCTION_BY_CODE));

/**
 * 控除使用額を 1 行追加する。
 *
 * 同じ (staff, deduction_type, year_month) に既存行があれば置き換え
 * (upsert ではなく、まず deleted_at を立てて新行を入れる) ではなく、
 * 「複数行 INSERT」方式で運用する。これは allowance_usage と揃えた挙動。
 * 二重入力を避けたい場合は UI 側で「既存をすべて消してから入力」する。
 */
export async function addDeductionUsage(params: {
  staffId: number;
  deductionType: string;
  yearMonth: string;
  amount: number;
  note?: string | null;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { staffId, deductionType, yearMonth, amount, note } = params;

  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "控除額は 0 円以上で入力してください" };
  }
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return { error: "年月の形式が不正です (YYYY-MM)" };
  }
  if (!VALID_CODES.has(deductionType)) {
    return { error: `対象外の控除種別です: ${deductionType}` };
  }

  const year = Number(yearMonth.slice(0, 4));

  const { error } = await supabase.from("deduction_usage").insert({
    staff_id: staffId,
    deduction_type: deductionType,
    year_month: yearMonth,
    year,
    amount: Math.round(amount),
    note: note || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${staffId}`);
  return { success: true };
}

/**
 * スタッフ × 控除種別 のデフォルト値を保存 / 解除する。
 * enabled=true で upsert すると次月以降の入力フォームに自動 prefill。
 * enabled=false に倒すと prefill 停止 (固定解除)。
 */
export async function saveDeductionDefault(params: {
  staffId: number;
  deductionType: string;
  amount: number;
  note?: string | null;
  enabled: boolean;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { staffId, deductionType, amount, note, enabled } = params;

  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "控除額は 0 円以上で入力してください" };
  }
  if (!VALID_CODES.has(deductionType)) {
    return { error: `対象外の控除種別です: ${deductionType}` };
  }

  const { error } = await supabase
    .from("deduction_defaults")
    .upsert(
      {
        staff_id: staffId,
        deduction_type: deductionType,
        amount: Math.round(amount),
        note: note || null,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_id,deduction_type" }
    );
  if (error) return { error: error.message };

  revalidatePath(`/payroll/${staffId}`);
  return { success: true };
}

export async function deleteDeductionUsage(
  id: number
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("deduction_usage")
    .select("staff_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("deduction_usage")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/payroll");
  if (row?.staff_id) {
    revalidatePath(`/payroll/${row.staff_id}`);
  }
  return { success: true };
}
