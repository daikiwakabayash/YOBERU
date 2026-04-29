/**
 * 「契約日のちょうど 1 ヶ月後」を返す。月末ルール:
 *
 *   2026-04-01 → 2026-05-01
 *   2026-04-30 → 2026-05-30
 *   2026-05-31 → 2026-06-30  (6 月は 30 日までなので clamp)
 *   2026-01-31 → 2026-02-28  (うるう年は 02-29)
 *
 * JS の Date#setMonth(+1) は「Jan 31 → Mar 3」と勝手に翌月送りされるので
 * 自前で「翌月の最終日を上限にする」処理を行う必要がある。
 *
 * 入出力ともに `YYYY-MM-DD` 文字列。不正な入力は空文字を返す。
 */
export function computeNextBillingDate(yyyymmdd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return "";
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return "";

  // 翌月の年・月を出す
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;

  // 翌月の末日 (day=0 で前月扱い → 翌月の場合は (nextM, 0) → 翌月の末日)
  const lastDayOfNextMonth = new Date(nextY, nextM, 0).getDate();
  const safeDay = Math.min(d, lastDayOfNextMonth);

  return `${nextY}-${String(nextM).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}
