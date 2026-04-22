/**
 * 1 予約あたりの消化額を計算する (deferred revenue recognition)。
 *
 * - ticket: 基本は floor(price / total_count)。ただし「最終回」
 *   (nextUsedCount === total_count) だけは端数を吸収させ、
 *   合計が price_snapshot と一致するようにする。
 *     例) 10,000 円 3 回券 → 3,333 / 3,333 / 3,334
 * - subscription: 毎回 floor(price / total_count) を計上 (サブスクは
 *   月次でリセットされるので「最終回」の概念は無い)。
 *   total_count が NULL の無制限サブスクは 0 (消化額を機械的に
 *   割り出せないため)。
 *
 * 純粋関数。Server Actions からも普通の Component からも呼べるよう
 * feature/customer-plan/actions 側ではなく helper/utils に配置。
 */
export function computePerVisitConsumedAmount(args: {
  planType: "ticket" | "subscription";
  priceSnapshot: number;
  totalCount: number | null;
  nextUsedCount: number;
}): number {
  const { planType, priceSnapshot, totalCount, nextUsedCount } = args;
  if (!priceSnapshot || priceSnapshot <= 0) return 0;
  if (!totalCount || totalCount <= 0) return 0;

  const perVisit = Math.floor(priceSnapshot / totalCount);
  if (planType === "ticket" && nextUsedCount >= totalCount) {
    // 最終回: 残り全額を乗せる
    return priceSnapshot - perVisit * (totalCount - 1);
  }
  return perVisit;
}
