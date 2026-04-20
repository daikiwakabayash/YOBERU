"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Client-side filter bar for the marketing dashboard. Writes to the URL
 * query string so the server component re-runs with the new params.
 * Preserves unrelated params (notably ?tab=...).
 */
interface MarketingFiltersProps {
  startMonth: string;
  endMonth: string;
  visitSourceId: number | null;
  staffId: number | null;
  visitSources: Array<{ id: number; name: string }>;
  staffs: Array<{ id: number; name: string }>;
  monthOptions: string[]; // ['2025-10', '2025-11', ...]
}

export function MarketingFilters({
  startMonth,
  endMonth,
  visitSourceId,
  staffId,
  visitSources,
  staffs,
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
      // 期間の整合性担保: start > end や end < start になったら
      // もう一方を自動追従させる (逆転すると 0 件になる不具合防止)。
      if (key === "start" && value) {
        const currentEnd = next.get("end") ?? endMonth;
        if (currentEnd.localeCompare(value) < 0) next.set("end", value);
      }
      if (key === "end" && value) {
        const currentStart = next.get("start") ?? startMonth;
        if (value.localeCompare(currentStart) < 0) next.set("start", value);
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, params, startMonth, endMonth]
  );

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-end gap-4 rounded-lg border bg-white/95 p-4 shadow-sm backdrop-blur">
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
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">スタッフ</label>
        <select
          className="h-9 min-w-[160px] rounded-md border px-3 text-sm"
          value={staffId == null ? "" : String(staffId)}
          onChange={(e) => updateParam("staff", e.target.value || null)}
        >
          <option value="">全スタッフ</option>
          {staffs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ml-auto text-[11px] text-gray-400">
        {visitSources.length}媒体 × {monthRangeCount(startMonth, endMonth)}ヶ月
        {staffs.length > 0 && ` × ${staffs.length}名`}
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
