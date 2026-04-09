"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Run daily aggregation for a specific date.
 * Updates customer visit_count, total_sales, last_visit_date.
 * Returns summary of new vs existing customers.
 */
export async function runDailyAggregation(shopId: number, date: string) {
  const supabase = await createClient();
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split("T")[0];

  // Check all appointments have been actioned
  const { count: unactionedCount } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null)
    .in("status", [0, 1]);

  if (unactionedCount && unactionedCount > 0) {
    return { error: "未対応の予約があります。全ての予約にアクションを行ってから集計してください。" };
  }

  // Get all completed appointments for this date
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id, customer_id, sales, status, visit_source_id")
    .eq("shop_id", shopId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  const completedAppts = (appointments ?? []).filter((a) => a.status === 2);
  const allAppts = appointments ?? [];

  // Count new vs existing
  let newCount = 0;
  let existingCount = 0;
  let totalSales = 0;

  const customerIds = [...new Set(completedAppts.map((a) => a.customer_id))];

  for (const customerId of customerIds) {
    // Get customer's total completed appointments
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("status", 2)
      .is("deleted_at", null);

    const customerAppts = completedAppts.filter(
      (a) => a.customer_id === customerId
    );
    const customerSales = customerAppts.reduce(
      (sum, a) => sum + (a.sales || 0),
      0
    );

    // Get total sales and visits across all time
    const { data: allCustomerAppts } = await supabase
      .from("appointments")
      .select("sales, start_at")
      .eq("customer_id", customerId)
      .eq("status", 2)
      .is("deleted_at", null)
      .order("start_at", { ascending: false });

    const totalVisits = count ?? 0;
    const allTimeSales = (allCustomerAppts ?? []).reduce(
      (sum, a) => sum + (a.sales || 0),
      0
    );
    const lastVisitDate = allCustomerAppts?.[0]?.start_at?.slice(0, 10) ?? null;

    // Update customer record
    await supabase
      .from("customers")
      .update({
        visit_count: totalVisits,
        total_sales: allTimeSales,
        last_visit_date: lastVisitDate,
      })
      .eq("id", customerId);

    // Is this a new customer? (visit_count <= 1 for today's appointments)
    if (totalVisits <= 1) {
      newCount++;
    } else {
      existingCount++;
    }

    totalSales += customerSales;
  }

  revalidatePath("/reservation");
  revalidatePath("/customer");
  revalidatePath("/sales");

  return {
    success: true,
    summary: {
      date,
      totalAppointments: allAppts.length,
      completedAppointments: completedAppts.length,
      newCustomers: newCount,
      existingCustomers: existingCount,
      totalSales,
    },
  };
}
