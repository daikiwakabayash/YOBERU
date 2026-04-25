"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  ALLOWANCE_BY_CODE,
  type AllowanceCode,
} from "../allowanceTypes";

const VALID_CODES = new Set<string>(Object.keys(ALLOWANCE_BY_CODE));

/**
 * 諸手当の使用額を 1 行追加する。
 *
 * 対象: carryover (study / event_access) と claim (美容 / 家族 / 通勤 /
 * 宿泊 / 紹介 / リクルート / 健康診断 / 引越し / 歯科)。
 *
 * 残枠超過 / 月額上限超過は **サーバー側では止めない** (warning として
 * 返却)。「ちょっとオーバーするけど OK」を許容したい運用があるため
 * 確認は UI 側 confirm に委ねる。
 */
export async function addAllowanceUsage(params: {
  staffId: number;
  allowanceType: string; // AllowanceCode を期待するが string で受ける
  yearMonth: string;
  amount: number;
  note?: string | null;
}): Promise<{ success?: true; error?: string; warning?: string }> {
  const supabase = await createClient();
  const { staffId, allowanceType, yearMonth, amount, note } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "金額は 1 円以上の整数で入力してください" };
  }
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return { error: "年月の形式が不正です (YYYY-MM)" };
  }
  if (!VALID_CODES.has(allowanceType)) {
    return { error: `対象外の手当種別です: ${allowanceType}` };
  }

  const meta = ALLOWANCE_BY_CODE[allowanceType as AllowanceCode];
  const year = Number(yearMonth.slice(0, 4));

  // monthlyCapYen が指定されている手当 (例: 通勤 = 20000) は当月の使用合計
  // と新規入力額を足してチェックする (警告のみ、ブロックしない)。
  let warning: string | undefined;
  if (meta.monthlyCapYen) {
    const { data: existing } = await supabase
      .from("allowance_usage")
      .select("amount")
      .eq("staff_id", staffId)
      .eq("allowance_type", allowanceType)
      .eq("year_month", yearMonth)
      .is("deleted_at", null);
    const usedThisMonth =
      (existing ?? []).reduce((s, r) => s + ((r.amount as number) ?? 0), 0);
    if (usedThisMonth + amount > meta.monthlyCapYen) {
      warning = `月額上限 ¥${meta.monthlyCapYen.toLocaleString()} を超えています (合計 ¥${(usedThisMonth + amount).toLocaleString()})`;
    }
  }

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
  return warning ? { success: true, warning } : { success: true };
}

export async function deleteAllowanceUsage(
  id: number
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
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
