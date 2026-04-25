"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/helper/lib/supabase/server";

export type LeaveType = "full" | "half_am" | "half_pm";

const VALID_TYPES = new Set<string>(["full", "half_am", "half_pm"]);

/**
 * 有給を 1 件登録する (即時 'approved')。
 *
 * MVP では申請 → 承認の 2 ステップは置かず、本部が代行入力する
 * 形を想定。同日に複数行を許容するか不明だが UNIQUE 制約は付けて
 * いない (午前半休 + 午後半休の組合せ運用も可能にするため)。
 */
export async function createPaidLeave(params: {
  staffId: number;
  leaveDate: string; // YYYY-MM-DD
  leaveType: LeaveType;
  reason?: string | null;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { staffId, leaveDate, leaveType, reason } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
    return { error: "日付の形式が不正です (YYYY-MM-DD)" };
  }
  if (!VALID_TYPES.has(leaveType)) {
    return { error: `不明な休暇種別です: ${leaveType}` };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let approvedBy: number | null = null;
  if (user?.email) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    approvedBy = (u?.id as number | undefined) ?? null;
  }

  const { error } = await supabase.from("paid_leaves").insert({
    staff_id: staffId,
    leave_date: leaveDate,
    leave_type: leaveType,
    reason: reason || null,
    status: "approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidatePath("/paid-leave");
  return { success: true };
}

export async function deletePaidLeave(
  id: number
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("paid_leaves")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/paid-leave");
  return { success: true };
}
