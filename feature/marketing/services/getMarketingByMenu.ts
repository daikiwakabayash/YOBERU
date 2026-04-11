"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * Per-menu breakdown for the マーケティング > メニュー tab.
 * Aggregates one shop's appointments by `menu_manage_id` and joins
 * menu names via a single lookup (no implicit join).
 */

export interface MenuTotals {
  menuManageId: string;
  menuName: string;
  reservationCount: number;
  visitCount: number;
  joinCount: number;
  cancelCount: number;
  sales: number;
  avgPrice: number;
  share: number; // sales share of the shop in this period (0..1)
}

export async function getMarketingByMenu(params: {
  shopId: number;
  startMonth: string;
  endMonth: string;
  visitSourceId?: number | null;
  staffId?: number | null;
}): Promise<MenuTotals[]> {
  const { shopId, startMonth, endMonth, visitSourceId, staffId } = params;
  const supabase = await createClient();

  const startTs = `${startMonth}-01T00:00:00+09:00`;
  const [ey, em] = endMonth.split("-").map(Number);
  const nextY = em === 12 ? ey + 1 : ey;
  const nextM = em === 12 ? 1 : em + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  let q = supabase
    .from("appointments")
    .select(
      "menu_manage_id, status, sales, is_member_join, visit_source_id"
    )
    .eq("shop_id", shopId)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  if (visitSourceId) q = q.eq("visit_source_id", visitSourceId);
  if (staffId) q = q.eq("staff_id", staffId);

  const { data: appts } = await q;
  const appointments = (appts ?? []) as Array<{
    menu_manage_id: string;
    status: number;
    sales: number | null;
    is_member_join: boolean | null;
  }>;

  // Bucket by menu_manage_id
  const byMenu = new Map<string, MenuTotals>();
  for (const a of appointments) {
    let bucket = byMenu.get(a.menu_manage_id);
    if (!bucket) {
      bucket = {
        menuManageId: a.menu_manage_id,
        menuName: a.menu_manage_id, // placeholder; replaced below
        reservationCount: 0,
        visitCount: 0,
        joinCount: 0,
        cancelCount: 0,
        sales: 0,
        avgPrice: 0,
        share: 0,
      };
      byMenu.set(a.menu_manage_id, bucket);
    }
    bucket.reservationCount += 1;
    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isVisit = a.status === 1 || a.status === 2;
    const isComplete = a.status === 2;
    if (isCancel) bucket.cancelCount += 1;
    if (isVisit) bucket.visitCount += 1;
    if (isComplete && a.sales) bucket.sales += a.sales;
    if (a.is_member_join) bucket.joinCount += 1;
  }

  // Resolve menu names in a single follow-up query
  const ids = [...byMenu.keys()];
  if (ids.length > 0) {
    const { data: menus } = await supabase
      .from("menus")
      .select("menu_manage_id, name")
      .in("menu_manage_id", ids)
      .is("deleted_at", null);
    const nameMap = new Map<string, string>(
      (menus ?? []).map((m) => [m.menu_manage_id as string, m.name as string])
    );
    for (const b of byMenu.values()) {
      b.menuName = nameMap.get(b.menuManageId) ?? b.menuManageId;
    }
  }

  const rows = Array.from(byMenu.values());
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  for (const r of rows) {
    r.avgPrice = r.visitCount > 0 ? r.sales / r.visitCount : 0;
    r.share = totalSales > 0 ? r.sales / totalSales : 0;
  }
  rows.sort((a, b) => b.sales - a.sales);
  return rows;
}
