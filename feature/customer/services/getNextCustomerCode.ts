import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 店舗ごとに「次に付与すべきカルテナンバー」を算出する。
 *
 * 運用要件: カルテナンバーは 1, 2, 3, 4... という小さな数字から
 * 順番に増やす。ブランクの店舗なら 1 番から始まる。
 *
 * これまでは「既存の最大数値 + 1」で採番していたが、過去に
 * インポート等で "4903366" のような巨大な値が 1 件でも入って
 * しまうと、以降のカルテナンバーが全部 4,903,367 以上になって
 * しまう不具合があった。そこで、**店舗内で現在使われていない
 * 最小の正の整数** を返す実装に変更している。
 *
 *   例: 1, 2, 3, 16, 4903366 が既存 → 次は 4
 *   例: (空)                       → 次は 1
 *   例: 1, 2, 3                    → 次は 4
 *
 * UNIQUE 制約は `(shop_id, code) WHERE deleted_at IS NULL` なので
 * 検索も deleted_at IS NULL だけを対象にし、ソフトデリート済み
 * のコードは再利用可能とする。
 */
export async function getNextCustomerCode(
  supabase: SupabaseClient,
  shopId: number
): Promise<string> {
  const { data } = await supabase
    .from("customers")
    .select("code")
    .eq("shop_id", shopId)
    .is("deleted_at", null);

  const used = new Set<number>();
  for (const r of (data ?? []) as Array<{ code: string | null }>) {
    const n = parseInt((r.code ?? "").trim(), 10);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }
  let next = 1;
  while (used.has(next)) next++;
  return String(next);
}
