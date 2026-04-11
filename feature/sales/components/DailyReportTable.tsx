import { Card } from "@/components/ui/card";
import type { DailyReportData } from "../services/getDailyReport";
import { CalendarDays } from "lucide-react";

interface DailyReportTableProps {
  data: DailyReportData;
}

function yen(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "¥0";
  return `¥${Math.round(n).toLocaleString()}`;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_COLORS = [
  "text-red-500",   // Sun
  "text-gray-700",  // Mon
  "text-gray-700",  // Tue
  "text-gray-700",  // Wed
  "text-gray-700",  // Thu
  "text-gray-700",  // Fri
  "text-blue-500",  // Sat
];

function formatDate(dateStr: string): { md: string; weekday: string; weekdayCls: string } {
  const [, m, d] = dateStr.split("-");
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return {
    md: `${Number(m)}/${Number(d)}`,
    weekday: WEEKDAY_LABELS[dow],
    weekdayCls: WEEKDAY_COLORS[dow],
  };
}

/**
 * Daily sales report — 1 row per day with visit/cancel counts, new vs
 * continuing sales split, payment-method breakdown, and per-source new
 * customer counts.
 *
 * Wide table with horizontal scroll on small screens. Designed to be
 * readable on tablet (the iPad screenshots in the spec).
 */
export function DailyReportTable({ data }: DailyReportTableProps) {
  const t = data.totals;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-gradient-to-r from-emerald-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
        <CalendarDays className="h-4 w-4 text-emerald-500" />
        日報 (デイリー売上)
        <span className="ml-auto text-[11px] font-normal text-gray-500">
          期間合計: 来店 {t.visitCount}名 / キャンセル {t.cancelCount}名 /
          売上 <span className="font-bold text-emerald-700">{yen(t.totalSales)}</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-medium">
                日付
              </th>
              <th className="px-3 py-2 text-right font-medium">来店</th>
              <th className="px-3 py-2 text-right font-medium">C</th>
              <th className="px-3 py-2 text-right font-medium">新規数</th>
              <th className="px-3 py-2 text-right font-medium">継続数</th>
              <th className="px-3 py-2 text-right font-medium">新規売上</th>
              <th className="px-3 py-2 text-right font-medium">継続売上</th>
              <th className="px-3 py-2 text-right font-medium">合計売上</th>
              <th className="px-4 py-2 text-left font-medium">決済内訳</th>
              <th className="px-4 py-2 text-left font-medium">媒体別 新規</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="py-10 text-center text-muted-foreground"
                >
                  期間内のデータがありません
                </td>
              </tr>
            ) : (
              data.rows.map((r) => {
                const dt = formatDate(r.date);
                return (
                  <tr key={r.date} className="hover:bg-gray-50/60">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-gray-900">
                          {dt.md}
                        </span>
                        <span className={`text-[10px] font-bold ${dt.weekdayCls}`}>
                          ({dt.weekday})
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-gray-400">
                        {r.date}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {r.visitCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {r.cancelCount || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right text-orange-600">
                      {r.newCount || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-600">
                      {r.continuingCount || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right text-orange-600">
                      {r.newSales > 0 ? yen(r.newSales) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-600">
                      {r.continuingSales > 0 ? yen(r.continuingSales) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                      {r.totalSales > 0 ? yen(r.totalSales) : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.payments.length === 0 ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.payments.map((p) => (
                            <span
                              key={p.code}
                              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700"
                            >
                              <span className="font-medium">{p.label}</span>
                              <span className="font-bold">{yen(p.amount)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.newBySource.length === 0 ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.newBySource.map((s) => (
                            <span
                              key={s.visitSourceId}
                              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700"
                            >
                              <span className="font-medium">{s.sourceName}</span>
                              <span className="font-bold">{s.newCount}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <tr>
                <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left text-gray-700">
                  期間合計
                </td>
                <td className="px-3 py-2.5 text-right text-gray-900">
                  {t.visitCount}
                </td>
                <td className="px-3 py-2.5 text-right text-red-500">
                  {t.cancelCount}
                </td>
                <td className="px-3 py-2.5 text-right text-orange-600">
                  {t.newCount}
                </td>
                <td className="px-3 py-2.5 text-right text-blue-600">
                  {t.continuingCount}
                </td>
                <td className="px-3 py-2.5 text-right text-orange-700">
                  {yen(t.newSales)}
                </td>
                <td className="px-3 py-2.5 text-right text-blue-700">
                  {yen(t.continuingSales)}
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-800">
                  {yen(t.totalSales)}
                </td>
                <td className="px-4 py-2.5" colSpan={2}>
                  <span className="text-[11px] font-normal text-gray-400">
                    決済 / 媒体は日次のみ
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
