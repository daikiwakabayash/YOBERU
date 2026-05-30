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
  /** 強制リンク (= クリエイティブ) 単位の広告費。NULL = 媒体全体 (migration 00050) */
  booking_link_id?: number | null;
  booking_link_title?: string | null;
  /** 配布数 / 表示回数 (チラシ枚数 or 広告 impressions)。手入力 or API 同期 */
  impressions?: number | null;
}

/**
 * Detect "table doesn't exist" Supabase / PostgREST errors. Used to
 * surface a clean "migration not run yet" banner instead of a raw error.
 */
export async function isMissingAdSpendTable(error: unknown): Promise<boolean> {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message ?? "");
  const code = (error as { code?: string }).code;
  // 「テーブルそのものが無い」ことを示す確実なシグナルだけで判定する。
  // 以前は msg に "ad_spend" / "schema cache" / "does not exist" が含まれる
  // だけで true を返していたが、これだと「列が無い」「ユニーク制約違反」など
  // テーブルは存在するのに失敗したケースまで「テーブル未作成」と誤判定して
  // しまうため、対象を relation (= テーブル) の欠落に限定する。
  return (
    code === "42P01" || // undefined_table
    code === "PGRST205" || // PostgREST: table not found in schema cache
    /relation ["']?ad_spend["']? does not exist/i.test(msg) ||
    (msg.includes("ad_spend") && msg.toLowerCase().includes("find the table"))
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

    // Enrich with booking_link title (migration 00050)
    const linkIds = [
      ...new Set(
        rows
          .map((r) => r.booking_link_id)
          .filter((id): id is number => id != null && id > 0)
      ),
    ];
    if (linkIds.length > 0) {
      const { data: links } = await supabase
        .from("booking_links")
        .select("id, title")
        .in("id", linkIds);
      const titleMap = new Map<number, string>(
        (links ?? []).map((l) => [l.id as number, l.title as string])
      );
      for (const r of rows) {
        if (r.booking_link_id != null) {
          r.booking_link_title = titleMap.get(r.booking_link_id) ?? null;
        }
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
