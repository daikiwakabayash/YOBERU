"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";
import { getRangeStaffUtilization } from "./getStaffUtilization";

interface SalesData {
  totalSales: number;
  totalCount: number;
  newCustomerSales: number;
  newCustomerCount: number;
  existingCustomerSales: number;
  existingCustomerCount: number;
  /**
   * 消化売上: 前金で販売したチケット/サブスクが、実際に来店で
   * 消化された分の合計 (円)。会計額 (totalSales) とは別軸で、
   * 前金前受金を「サービス提供時点の売上」として認識する指標。
   */
  consumedSales: number;
  /** consumed_amount > 0 だった予約の件数 */
  consumedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  staffSales: Array<{
    staffId: number;
    staffName: string;
    sales: number;
    count: number;
    /** 施術数 = status 1/2 かつ type=0 のみ (ミーティング/キャンセル除外) */
    treatmentCount: number;
    /** 新規数 = 施術のうち visit_count=1 の件数 */
    newCount: number;
    /** スタッフ別消化売上 (完了予約) */
    consumedSales: number;
    /** 期間内の総開放時間 (= シフト合計、分単位) */
    openMin: number;
    /** 期間内の稼働時間 (status 1/2 のみ、分単位) */
    busyMin: number;
    /** 0..1, 0 when openMin === 0 */
    utilizationRate: number;
  }>;
}

/**
 * Get sales summary for a date range, optionally scoped to a single staff.
 *
 * When `staffId` is given the query is filtered to that staff only — all
 * downstream aggregation (new/existing split, staff rankings) still works
 * and the returned `staffSales` will contain a single row for that staff.
 */
export async function getSalesSummary(
  shopId: number,
  startDate: string,
  endDate: string,
  staffId?: number | null
): Promise<SalesData> {
  const supabase = await createClient();
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  let query = supabase
    .from("appointments")
    .select(
      "id, staff_id, sales, consumed_amount, status, type, visit_count, cancelled_at, staffs(name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);
  if (staffId) {
    query = query.eq("staff_id", staffId);
  }
  const { data: appointments } = await query;

  const appts = appointments ?? [];

  const completed = appts.filter((a) => a.status === 2);
  const cancelled = appts.filter(
    (a) => a.status === 3 || a.cancelled_at
  );
  const noShow = appts.filter((a) => a.status === 99);

  const totalSales = completed.reduce((sum, a) => sum + (a.sales || 0), 0);
  const totalCount = completed.length;
  // 消化売上 = 完了予約のうち consumed_amount > 0 の合計。
  // sales (当日入金) とは別軸で、前金プランの実消費を計上する。
  const consumedSales = completed.reduce(
    (sum, a) => sum + ((a.consumed_amount as number | null) ?? 0),
    0
  );
  const consumedCount = completed.filter(
    (a) => ((a.consumed_amount as number | null) ?? 0) > 0
  ).length;

  // For new/existing split, type=0 is normal booking
  // We approximate new customers by checking type field
  // In production, this would cross-reference customer's first visit date
  const newCustomerAppts = completed.filter((a) => a.type === 0);
  const existingCustomerAppts = completed.filter((a) => a.type !== 0);

  // Staff breakdown (completed appointments for sales/count) + treatment
  // count (status 1/2, type=0 — actual 施術 only) + new customer count.
  const staffMap = new Map<
    number,
    {
      staffName: string;
      sales: number;
      count: number;
      treatmentCount: number;
      newCount: number;
      consumedSales: number;
    }
  >();

  function getOrCreateStaff(
    sId: number,
    name: string
  ) {
    let row = staffMap.get(sId);
    if (!row) {
      row = {
        staffName: name,
        sales: 0,
        count: 0,
        treatmentCount: 0,
        newCount: 0,
        consumedSales: 0,
      };
      staffMap.set(sId, row);
    }
    return row;
  }

  // Pass 1: completed appointments → sales / count / consumed
  for (const appt of completed) {
    const staffData = appt.staffs as unknown as { name: string } | null;
    const row = getOrCreateStaff(
      appt.staff_id,
      staffData?.name ?? "不明"
    );
    row.sales += appt.sales || 0;
    row.count += 1;
    row.consumedSales +=
      ((appt.consumed_amount as number | null) ?? 0);
  }

  // Pass 2: treatment count + new count. Includes status 1 (施術中) AND
  // status 2 (完了), but only type=0 (通常予約). Excludes meetings,
  // breaks, cancels, no-shows.
  for (const appt of appts) {
    const isCustomerAppt = (appt.type as number) === 0;
    const isTreatment =
      isCustomerAppt && ((appt.status as number) === 1 || (appt.status as number) === 2);
    if (!isTreatment) continue;

    const staffData = appt.staffs as unknown as { name: string } | null;
    const row = getOrCreateStaff(
      appt.staff_id as number,
      staffData?.name ?? "不明"
    );
    row.treatmentCount += 1;
    if ((appt.visit_count as number | null) === 1) {
      row.newCount += 1;
    }
  }

  // Range utilization (open / busy / rate) — same date range, optionally
  // narrowed to the same staff filter the page is using.
  const utilizationByStaff = await getRangeStaffUtilization(
    shopId,
    startDate,
    endDate,
    staffId ?? null
  ).catch(() => new Map<number, { openMin: number; busyMin: number; rate: number }>());

  // Merge utilization rows that have NO sales-completed appointment so
  // staff who worked but had everything cancelled (rare) still appear.
  for (const [sId, u] of utilizationByStaff.entries()) {
    if (!staffMap.has(sId) && u.openMin > 0) {
      staffMap.set(sId, {
        staffName: "(staff #" + sId + ")",
        sales: 0,
        count: 0,
        treatmentCount: 0,
        newCount: 0,
        consumedSales: 0,
      });
    }
  }

  return {
    totalSales,
    totalCount,
    newCustomerSales: newCustomerAppts.reduce(
      (sum, a) => sum + (a.sales || 0),
      0
    ),
    newCustomerCount: newCustomerAppts.length,
    existingCustomerSales: existingCustomerAppts.reduce(
      (sum, a) => sum + (a.sales || 0),
      0
    ),
    existingCustomerCount: existingCustomerAppts.length,
    consumedSales,
    consumedCount,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    noShowCount: noShow.length,
    staffSales: Array.from(staffMap.entries())
      .map(([sId, data]) => {
        const u = utilizationByStaff.get(sId);
        return {
          staffId: sId,
          ...data,
          openMin: u?.openMin ?? 0,
          busyMin: u?.busyMin ?? 0,
          utilizationRate: u && u.openMin > 0 ? u.rate : 0,
        };
      })
      .sort((a, b) => b.sales - a.sales),
  };
}
