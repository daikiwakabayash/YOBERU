"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { AllowanceCode } from "../allowanceTypes";

export interface AllowanceDefault {
  allowanceType: AllowanceCode;
  amount: number;
  note: string | null;
  enabled: boolean;
}

/**
 * 1 スタッフのデフォルト保存値を全種別ぶん取得し、Map で返す。
 * 行が無い、もしくは enabled=false なら prefill しない (UI 側は空白)。
 *
 * migration 00036 (allowance_defaults) 未適用環境では table 不在で
 * クエリが落ちるので空 Map を返してフォールバックする。
 */
export async function getAllowanceDefaults(
  staffId: number
): Promise<Map<AllowanceCode, AllowanceDefault>> {
  const supabase = await createClient();
  const result = new Map<AllowanceCode, AllowanceDefault>();

  const { data, error } = await supabase
    .from("allowance_defaults")
    .select("allowance_type, amount, note, enabled")
    .eq("staff_id", staffId);

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("allowance_defaults") ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      return result;
    }
    throw error;
  }

  for (const r of data ?? []) {
    result.set(r.allowance_type as AllowanceCode, {
      allowanceType: r.allowance_type as AllowanceCode,
      amount: (r.amount as number) ?? 0,
      note: (r.note as string | null) ?? null,
      enabled: !!r.enabled,
    });
  }
  return result;
}
