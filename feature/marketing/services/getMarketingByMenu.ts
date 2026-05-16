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

  // 新規のみ = 顧客の人生最古 status=2 予約 id 一致。getMarketingData.ts
  // と同じ方針。入会判定はライフタイム (customer_plans or is_member_join)。
  let q = supabase
    .from("appointments")
    .select(
      "id, customer_id, menu_manage_id, status, sales, visit_source_id, start_at"
    )
    .eq("shop_id", shopId)
    .eq("status", 2)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null);
  if (visitSourceId) q = q.eq("visit_source_id", visitSourceId);
  if (staffId) q = q.eq("staff_id", staffId);

  const { data: appts } = await q;
  const appointments = (appts ?? []) as Array<{
    id: number;
    customer_id: number | null;
    menu_manage_id: string;
    status: number;
    sales: number | null;
    start_at: string;
  }>;

  // ライフタイム attribution
  const customerIdsInRange = Array.from(
    new Set(
      appointments
        .map((a) => a.customer_id)
        .filter((id): id is number => id != null)
    )
  );
  const firstCompletedApptIdByCustomer = new Map<number, number>();
  const customerEverJoined = new Set<number>();
  if (customerIdsInRange.length > 0) {
    const [completedHistRes, plansRes, joinFlagApptsRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, customer_id, start_at")
        .eq("shop_id", shopId)
        .eq("status", 2)
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
      supabase
        .from("customer_plans")
        .select("customer_id")
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null),
      supabase
        .from("appointments")
        .select("customer_id")
        .eq("shop_id", shopId)
        .eq("is_member_join", true)
        .in("customer_id", customerIdsInRange)
        .is("deleted_at", null),
    ]);
    for (const r of (completedHistRes.data ?? []) as Array<{
      id: number;
      customer_id: number;
      start_at: string;
    }>) {
      if (!firstCompletedApptIdByCustomer.has(r.customer_id)) {
        firstCompletedApptIdByCustomer.set(r.customer_id, r.id);
      }
    }
    for (const p of (plansRes.data ?? []) as Array<{ customer_id: number }>) {
      customerEverJoined.add(p.customer_id);
    }
    for (const r of (joinFlagApptsRes.data ?? []) as Array<{
      customer_id: number;
    }>) {
      customerEverJoined.add(r.customer_id);
    }
  }

  // Bucket by menu_manage_id
  const byMenu = new Map<string, MenuTotals>();
  for (const a of appointments) {
    if (a.customer_id == null) continue;
    if (firstCompletedApptIdByCustomer.get(a.customer_id) !== a.id) continue;
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
    // 新規 attribution の予約は status=2 確定なので 予約 = 実来院 = 1。
    bucket.reservationCount += 1;
    bucket.visitCount += 1;
    if (a.sales) bucket.sales += a.sales;
    if (customerEverJoined.has(a.customer_id)) {
      bucket.joinCount += 1;
    }
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
