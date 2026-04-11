"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";

interface SalesFiltersProps {
  startDate: string;
  endDate: string;
  staffId: number | null;
  staffs: Array<{ id: number; name: string }>;
}

/**
 * Client filter bar for /sales and /kpi. Writes to ?start / ?end / ?staff
 * so the server component re-runs. Applies on "適用" click so the user can
 * set both dates before the page refetches.
 */
export function SalesFilters({
  startDate,
  endDate,
  staffId,
  staffs,
}: SalesFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [staff, setStaff] = useState<number | "">(staffId ?? "");

  // Re-sync when the server re-renders (e.g. after router.refresh)
  useEffect(() => setStart(startDate), [startDate]);
  useEffect(() => setEnd(endDate), [endDate]);
  useEffect(() => setStaff(staffId ?? ""), [staffId]);

  const apply = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.set("start", start);
    next.set("end", end);
    if (staff === "" || staff == null) next.delete("staff");
    else next.set("staff", String(staff));
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [params, router, start, end, staff]);

  const clearStaff = useCallback(() => {
    setStaff("");
    const next = new URLSearchParams(params.toString());
    next.delete("staff");
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [params, router]);

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">期間 開始</label>
        <input
          type="date"
          className="h-9 rounded-md border px-3 text-sm"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">期間 終了</label>
        <input
          type="date"
          className="h-9 rounded-md border px-3 text-sm"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">スタッフ</label>
        <div className="flex items-center gap-2">
          <select
            className="h-9 min-w-[160px] rounded-md border px-3 text-sm"
            value={staff}
            onChange={(e) =>
              setStaff(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">全スタッフ</option>
            {staffs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {staff !== "" && staff != null && (
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-gray-700"
              onClick={clearStaff}
            >
              クリア
            </button>
          )}
        </div>
      </div>
      <div className="ml-auto">
        <button
          type="button"
          onClick={apply}
          className="h-9 rounded-md bg-gray-900 px-5 text-sm font-bold text-white hover:bg-gray-800"
        >
          適用
        </button>
      </div>
    </div>
  );
}
