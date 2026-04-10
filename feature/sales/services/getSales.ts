"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

interface SalesData {
  totalSales: number;
  totalCount: number;
  newCustomerSales: number;
  newCustomerCount: number;
  existingCustomerSales: number;
  existingCustomerCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  staffSales: Array<{
    staffId: number;
    staffName: string;
    sales: number;
    count: number;
  }>;
}

/**
 * Get sales summary for a date range
 */
export async function getSalesSummary(
  shopId: number,
  startDate: string,
  endDate: string
): Promise<SalesData> {
  const supabase = await createClient();
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, staff_id, sales, status, type, cancelled_at, staffs(name)")
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);

  const appts = appointments ?? [];

  const completed = appts.filter((a) => a.status === 2);
  const cancelled = appts.filter(
    (a) => a.status === 3 || a.cancelled_at
  );
  const noShow = appts.filter((a) => a.status === 99);

  const totalSales = completed.reduce((sum, a) => sum + (a.sales || 0), 0);
  const totalCount = completed.length;

  // For new/existing split, type=0 is normal booking
  // We approximate new customers by checking type field
  // In production, this would cross-reference customer's first visit date
  const newCustomerAppts = completed.filter((a) => a.type === 0);
  const existingCustomerAppts = completed.filter((a) => a.type !== 0);

  // Staff breakdown
  const staffMap = new Map<
    number,
    { staffName: string; sales: number; count: number }
  >();
  for (const appt of completed) {
    const staffId = appt.staff_id;
    const staffData = appt.staffs as unknown as { name: string } | null;
    const existing = staffMap.get(staffId) || {
      staffName: staffData?.name ?? "不明",
      sales: 0,
      count: 0,
    };
    existing.sales += appt.sales || 0;
    existing.count += 1;
    staffMap.set(staffId, existing);
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
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    noShowCount: noShow.length,
    staffSales: Array.from(staffMap.entries())
      .map(([staffId, data]) => ({
        staffId,
        ...data,
      }))
      .sort((a, b) => b.sales - a.sales),
  };
}
