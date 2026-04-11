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
 * Detect "table doesn't exist" Supabase / PostgREST errors. Used to
 * surface a clean "migration not run yet" banner instead of a raw error.
 */
export async function isMissingAdSpendTable(error: unknown): Promise<boolean> {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message ?? "");
  const code = (error as { code?: string }).code;
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.toLowerCase().includes("ad_spend") ||
    code === "42P01" ||
    code === "PGRST205"
  );
}

export interface AdSpendListResult {
  rows: AdSpendRow[];
  setupRequired: boolean;
}

/**
 * Fetch ad_spend rows for a shop (and optional month range). Joined with
 * visit_sources via a separate lookup (no implicit FK join).
 *
 * If the underlying table doesn't exist yet (migration 00007 not yet
 * applied) returns `setupRequired: true` so the page can render a
 * helpful banner instead of crashing.
 */
export async function getAdSpendRows(
  shopId: number,
  options?: { startMonth?: string; endMonth?: string }
): Promise<AdSpendListResult> {
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
    if (error) {
      if (await isMissingAdSpendTable(error)) {
        return { rows: [], setupRequired: true };
      }
      return { rows: [], setupRequired: false };
    }
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
    return { rows, setupRequired: false };
  } catch (e) {
    if (await isMissingAdSpendTable(e)) {
      return { rows: [], setupRequired: true };
    }
    return { rows: [], setupRequired: false };
  }
}

/**
 * Sum of ad spend grouped by year_month × visit_source_id, scoped to one
 * shop. Used by the marketing dashboard aggregation. Returns empty array
 * for any error (including missing table) so dashboards keep rendering.
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
