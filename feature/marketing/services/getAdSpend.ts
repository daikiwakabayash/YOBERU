"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface AdSpendRow {
  id: number;
  brand_id: number;
  shop_id: number;
  visit_source_id: number;
  year_month: string; // 'YYYY-MM'
  amount: number;
  memo: string | null;
  source_name?: string | null;
  shop_name?: string | null;
}

/**
 * Fetch ad_spend rows for a shop (and optional month range). Joined with
 * visit_sources and shops via separate lookups (no implicit FK join).
 */
export async function getAdSpendRows(
  shopId: number,
  options?: { startMonth?: string; endMonth?: string }
): Promise<AdSpendRow[]> {
  const supabase = await createClient();
  try {
    let q = supabase
      .from("ad_spend")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("year_month", { ascending: false })
      .order("id", { ascending: false });
    if (options?.startMonth) q = q.gte("year_month", options.startMonth);
    if (options?.endMonth) q = q.lte("year_month", options.endMonth);
    const { data, error } = await q;
    if (error) return [];
    const rows = (data ?? []) as AdSpendRow[];

    // Enrich with visit_source name via a single separate query
    const sourceIds = [...new Set(rows.map((r) => r.visit_source_id))];
    if (sourceIds.length > 0) {
      const { data: sources } = await supabase
        .from("visit_sources")
        .select("id, name")
        .in("id", sourceIds);
      const nameMap = new Map<number, string>(
        (sources ?? []).map((s) => [s.id as number, s.name as string])
      );
      for (const r of rows) {
        r.source_name = nameMap.get(r.visit_source_id) ?? null;
      }
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Sum of ad spend grouped by year_month × visit_source_id, scoped to one
 * shop. Used by the marketing dashboard aggregation.
 */
export async function getAdSpendForRange(
  shopId: number,
  startMonth: string,
  endMonth: string
): Promise<Array<{
  visit_source_id: number;
  year_month: string;
  amount: number;
}>> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("ad_spend")
      .select("visit_source_id, year_month, amount")
      .eq("shop_id", shopId)
      .gte("year_month", startMonth)
      .lte("year_month", endMonth)
      .is("deleted_at", null);
    if (error) return [];
    return (data ?? []) as Array<{
      visit_source_id: number;
      year_month: string;
      amount: number;
    }>;
  } catch {
    return [];
  }
}
