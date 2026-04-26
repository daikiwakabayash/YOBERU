"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { DeductionCode } from "../deductionTypes";

export interface DeductionDefault {
  deductionType: DeductionCode;
  amount: number;
  note: string | null;
  enabled: boolean;
}

/**
 * 1 スタッフの控除デフォルト値を全種別ぶん取得し、Map で返す。
 * enabled=false の行は prefill しない (UI 側は空白)。
 *
 * migration 00038 (deduction_defaults) 未適用環境では table 不在で
 * クエリが落ちるので空 Map を返してフォールバックする。
 */
export async function getDeductionDefaults(
  staffId: number
): Promise<Map<DeductionCode, DeductionDefault>> {
  const supabase = await createClient();
  const result = new Map<DeductionCode, DeductionDefault>();

  const { data, error } = await supabase
    .from("deduction_defaults")
    .select("deduction_type, amount, note, enabled")
    .eq("staff_id", staffId);

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("deduction_defaults") ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      return result;
    }
    throw error;
  }

  for (const r of data ?? []) {
    result.set(r.deduction_type as DeductionCode, {
      deductionType: r.deduction_type as DeductionCode,
      amount: (r.amount as number) ?? 0,
      note: (r.note as string | null) ?? null,
      enabled: !!r.enabled,
    });
  }
  return result;
}
