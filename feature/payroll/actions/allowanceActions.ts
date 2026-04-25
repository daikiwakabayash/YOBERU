"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * 繰越あり手当 (study / event_access) の使用を 1 行追加する。
 * 残枠を超えていてもサーバー側では止めず、入力された額を素直に記録する
 * (運用上「ちょっとオーバーするけど OK」を許容したい場面があるため)。
 * 残枠の警告は UI 側 (CarryoverClaimForm) で確認ダイアログを出して
 * ユーザー自身に判断させる。
 */
export async function addAllowanceUsage(params: {
  staffId: number;
  allowanceType: "study" | "event_access";
  yearMonth: string; // 'YYYY-MM'
  amount: number;
  note?: string | null;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { staffId, allowanceType, yearMonth, amount, note } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "金額は 1 円以上の整数で入力してください" };
  }
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return { error: "年月の形式が不正です (YYYY-MM)" };
  }
  if (allowanceType !== "study" && allowanceType !== "event_access") {
    return { error: "対象外の手当種別です" };
  }

  const year = Number(yearMonth.slice(0, 4));

  const { error } = await supabase.from("allowance_usage").insert({
    staff_id: staffId,
    allowance_type: allowanceType,
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

export async function deleteAllowanceUsage(
  id: number
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  // staff_id を引いてからソフト削除 → revalidatePath
  const { data: row } = await supabase
    .from("allowance_usage")
    .select("staff_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("allowance_usage")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/payroll");
  if (row?.staff_id) {
    revalidatePath(`/payroll/${row.staff_id}`);
  }
  return { success: true };
}
