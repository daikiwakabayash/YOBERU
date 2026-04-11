import { Card } from "@/components/ui/card";
import type { MenuTotals } from "../services/getMarketingByMenu";
import { yen, pct, num, rankBadgeClass } from "./format";
import { Utensils } from "lucide-react";

interface MarketingMenuBreakdownProps {
  menus: MenuTotals[];
}

/**
 * メニュー別タブ: ranks every menu in the shop by sales for the period,
 * showing its count, sales, avg price, and share%.
 */
export function MarketingMenuBreakdown({ menus }: MarketingMenuBreakdownProps) {
  const totalSales = menus.reduce((s, m) => s + m.sales, 0);
  const totalCount = menus.reduce((s, m) => s + m.reservationCount, 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <Card className="overflow-hidden border-purple-200/60">
        <div className="grid grid-cols-2 gap-4 bg-gradient-to-r from-purple-50 to-fuchsia-50/40 p-5 sm:grid-cols-3">
          <SummaryTile label="メニュー数" value={`${num(menus.length)}件`} />
          <SummaryTile
            label="予約合計"
            value={`${num(totalCount)}件`}
          />
          <SummaryTile
            label="売上合計"
            value={yen(totalSales)}
            accent="text-emerald-700"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-gradient-to-r from-purple-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <Utensils className="h-4 w-4 text-purple-500" />
          メニュー別ランキング
          <span className="ml-auto text-xs font-normal text-gray-400">
            売上順
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="w-12 px-3 py-2 text-center font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">メニュー</th>
                <th className="px-3 py-2 text-right font-medium">予約数</th>
                <th className="px-3 py-2 text-right font-medium">実施数</th>
                <th className="px-3 py-2 text-right font-medium">入会</th>
                <th className="px-3 py-2 text-right font-medium">C数</th>
                <th className="px-3 py-2 text-right font-medium">平均単価</th>
                <th className="px-3 py-2 text-right font-medium">売上</th>
                <th className="px-3 py-2 text-right font-medium">構成比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {menus.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-8 text-center text-muted-foreground"
                  >
                    期間内のメニューデータがありません
                  </td>
                </tr>
              ) : (
                menus.map((m, i) => {
                  const rank = i + 1;
                  return (
                    <tr
                      key={m.menuManageId}
                      className="hover:bg-gray-50/60"
                    >
                      <td className="px-3 py-2 text-center">
                        <span className={rankBadgeClass(rank)}>{rank}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-bold text-gray-900">
                          {m.menuName}
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">
                          {m.menuManageId}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {num(m.reservationCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {num(m.visitCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-600">
                        {num(m.joinCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-red-500">
                        {num(m.cancelCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {yen(m.avgPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">
                        {yen(m.sales)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full bg-gradient-to-r from-purple-400 to-fuchsia-500"
                              style={{
                                width: `${Math.min(100, m.share * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="w-10 text-right text-purple-600">
                            {pct(m.share)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent = "text-gray-900",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-black ${accent}`}>{value}</div>
    </div>
  );
}
