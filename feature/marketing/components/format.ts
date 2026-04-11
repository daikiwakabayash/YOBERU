// Small shared formatters used across all marketing/kpi tables and cards.

export function yen(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "¥0";
  return `¥${Math.round(n).toLocaleString()}`;
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(0)}%`;
}

export function num(n: number): string {
  return (Math.round(n) || 0).toLocaleString();
}

/**
 * Rank badge CSS classes — gold / silver / bronze for the top 3, plain
 * gray for everything else. Used by staff / shop / menu ranking tables.
 */
export function rankBadgeClass(rank: number): string {
  const base =
    "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black shadow-sm";
  if (rank === 1)
    return `${base} bg-gradient-to-br from-amber-400 to-orange-500 text-white`;
  if (rank === 2)
    return `${base} bg-gradient-to-br from-slate-300 to-slate-400 text-white`;
  if (rank === 3)
    return `${base} bg-gradient-to-br from-orange-600 to-orange-700 text-white`;
  return `${base} bg-gray-100 text-gray-500`;
}
