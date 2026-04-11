"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Client-side filter bar for the marketing dashboard. Writes to the URL
 * query string so the server component re-runs with the new params.
 */
interface MarketingFiltersProps {
  startMonth: string;
  endMonth: string;
  visitSourceId: number | null;
  visitSources: Array<{ id: number; name: string }>;
  monthOptions: string[]; // ['2025-10', '2025-11', ...]
}

export function MarketingFilters({
  startMonth,
  endMonth,
  visitSourceId,
  visitSources,
  monthOptions,
}: MarketingFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value == null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, params]
  );

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">期間</label>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border px-3 text-sm"
            value={startMonth}
            onChange={(e) => updateParam("start", e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">〜</span>
          <select
            className="h-9 rounded-md border px-3 text-sm"
            value={endMonth}
            onChange={(e) => updateParam("end", e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">媒体</label>
        <select
          className="h-9 rounded-md border px-3 text-sm"
          value={visitSourceId == null ? "" : String(visitSourceId)}
          onChange={(e) => updateParam("source", e.target.value || null)}
        >
          <option value="">全媒体</option>
          {visitSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ml-auto text-[11px] text-gray-400">
        {/* Count hint e.g. "N media × M months" */}
        {visitSources.length}媒体 × {monthRangeCount(startMonth, endMonth)}ヶ月
      </div>
    </div>
  );
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y.slice(2)}年${Number(m)}月`;
}

function monthRangeCount(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return 0;
  return (by - ay) * 12 + (bm - am) + 1;
}
