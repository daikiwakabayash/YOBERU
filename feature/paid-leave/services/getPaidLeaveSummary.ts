"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { listStatutoryGrants } from "../utils/computeStatutoryGrant";

export interface PaidLeaveRow {
  id: number;
  staffId: number;
  leaveDate: string;
  leaveType: "full" | "half_am" | "half_pm";
  reason: string | null;
  status: string;
}

export interface StaffPaidLeaveSummary {
  staffId: number;
  staffName: string;
  hiredAt: string | null;
  /** 法定上付与されているはずの累計日数 (失効済を除く) */
  grantedDays: number;
  /** 当年度に消化した日数 (full=1, half_*=0.5) */
  usedDays: number;
  remainingDays: number;
  upcomingExpiry: { grantedAt: string; expiresAt: string; days: number } | null;
  rows: PaidLeaveRow[];
}

const dayValue = (t: string) => (t === "full" ? 1 : 0.5);

/**
 * 店舗単位で全スタッフの有給状況サマリを返す。
 * 法定付与は paid_leave_grants table が空でも入社日から推定する
 * (DB 行が無くても画面に「想定残数」を表示する)。
 */
export async function getPaidLeaveSummary(params: {
  shopId: number;
}): Promise<StaffPaidLeaveSummary[]> {
  const supabase = await createClient();
  const { shopId } = params;

  const [staffRes, leaveRes, grantRes] = await Promise.all([
    supabase
      .from("staffs")
      .select("id, name, hired_at")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("allocate_order", { ascending: true, nullsFirst: false }),
    supabase
      .from("paid_leaves")
      .select("id, staff_id, leave_date, leave_type, reason, status")
      .is("deleted_at", null)
      .order("leave_date", { ascending: false }),
    supabase
      .from("paid_leave_grants")
      .select("staff_id, granted_at, expires_at, days")
      .is("deleted_at", null),
  ]);

  const staffs = (staffRes.data ?? []).map((s) => ({
    id: s.id as number,
    name: s.name as string,
    hiredAt: (s.hired_at as string | null) ?? null,
  }));
  const allLeaves = leaveRes.error ? [] : leaveRes.data ?? [];
  const allGrants = grantRes.error ? [] : grantRes.data ?? [];

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  return staffs.map((s) => {
    const myLeaves = allLeaves.filter((l) => l.staff_id === s.id);
    const myGrantsDb = allGrants.filter((g) => g.staff_id === s.id);

    // 法定付与: DB に行が無くても入社日から推定する。
    // DB 行があればそちらを正 (本部が手動調整した値) とする。
    let grantsActive: { grantedAt: string; expiresAt: string; days: number }[] = [];
    if (myGrantsDb.length > 0) {
      grantsActive = myGrantsDb.map((g) => ({
        grantedAt: g.granted_at as string,
        expiresAt: g.expires_at as string,
        days: Number(g.days as number),
      }));
    } else if (s.hiredAt) {
      const grants = listStatutoryGrants(new Date(s.hiredAt), today);
      grantsActive = grants.map((g) => ({
        grantedAt: g.grantedAt.toISOString().slice(0, 10),
        expiresAt: g.expiresAt.toISOString().slice(0, 10),
        days: g.days,
      }));
    }

    // 失効分は除外
    const validGrants = grantsActive.filter((g) => g.expiresAt > isoToday);
    const grantedDays = validGrants.reduce((sum, g) => sum + g.days, 0);

    // 当年度: 1/1 〜 12/31 を仮置き (会計年度起算は将来オプション)
    const yearStart = `${today.getFullYear()}-01-01`;
    const usedDays = myLeaves
      .filter(
        (l) =>
          l.status === "approved" &&
          (l.leave_date as string) >= yearStart &&
          (l.leave_date as string) <= isoToday
      )
      .reduce((sum, l) => sum + dayValue(l.leave_type as string), 0);

    const remainingDays = Math.max(0, grantedDays - usedDays);

    // 直近の失効予定 (1 年以内に消化推奨を促す)
    const upcoming = [...validGrants].sort((a, b) =>
      a.expiresAt.localeCompare(b.expiresAt)
    )[0];

    return {
      staffId: s.id,
      staffName: s.name,
      hiredAt: s.hiredAt,
      grantedDays,
      usedDays,
      remainingDays,
      upcomingExpiry: upcoming ?? null,
      rows: myLeaves.map((l) => ({
        id: l.id as number,
        staffId: l.staff_id as number,
        leaveDate: l.leave_date as string,
        leaveType: l.leave_type as PaidLeaveRow["leaveType"],
        reason: (l.reason as string | null) ?? null,
        status: l.status as string,
      })),
    };
  });
}
