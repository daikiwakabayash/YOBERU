import { Card } from "@/components/ui/card";
import type { ShopTotals } from "../services/getMarketingByShop";
import { yen, pct, num, rankBadgeClass } from "./format";
import { MapPin } from "lucide-react";

interface MarketingShopBreakdownProps {
  shops: ShopTotals[];
  grandTotal: Omit<ShopTotals, "shopId" | "shopName">;
}

/**
 * 店舗別タブ: brand-wide ranking of shops by sales, with CPA / ROAS /
 * 入会率 / キャンセル率 columns. Top 3 shops get gold/silver/bronze rank
 * badges for easy glance-ranking.
 */
export function MarketingShopBreakdown({
  shops,
  grandTotal,
}: MarketingShopBreakdownProps) {
  return (
    <div className="space-y-4">
      {/* Grand total strip */}
      <Card className="overflow-hidden border-orange-200/60">
        <div className="grid grid-cols-2 gap-4 bg-gradient-to-r from-orange-50 to-amber-50/40 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <TotalTile label="店舗数" value={`${num(shops.length)}店舗`} />
          <TotalTile
            label="実来院数"
            value={`${num(grandTotal.visitCount)}名`}
          />
          <TotalTile
            label="入会率"
            value={pct(grandTotal.joinRate)}
            accent="text-blue-600"
          />
          <TotalTile
            label="広告費"
            value={yen(grandTotal.adSpend)}
            accent="text-red-500"
          />
          <TotalTile
            label="売上"
            value={yen(grandTotal.sales)}
            accent="text-emerald-700"
          />
          <TotalTile
            label="ROAS"
            value={grandTotal.adSpend > 0 ? pct(grandTotal.roas) : "-"}
            accent="text-emerald-700"
          />
        </div>
      </Card>

      {/* Per-shop ranking table */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-gradient-to-r from-orange-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <MapPin className="h-4 w-4 text-orange-500" />
          店舗別ランキング
          <span className="ml-auto text-xs font-normal text-gray-400">
            売上順
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="w-12 px-3 py-2 text-center font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">店舗</th>
                <th className="px-3 py-2 text-right font-medium">予約</th>
                <th className="px-3 py-2 text-right font-medium">実来院</th>
                <th className="px-3 py-2 text-right font-medium">入会</th>
                <th className="px-3 py-2 text-right font-medium">入会率</th>
                <th className="px-3 py-2 text-right font-medium">C率</th>
                <th className="px-3 py-2 text-right font-medium">広告費</th>
                <th className="px-3 py-2 text-right font-medium">CPA</th>
                <th className="px-3 py-2 text-right font-medium">売上</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shops.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-8 text-center text-muted-foreground"
                  >
                    店舗データがありません
                  </td>
                </tr>
              ) : (
                shops.map((s, i) => {
                  const rank = i + 1;
                  return (
                    <tr key={s.shopId} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 text-center">
                        <span className={rankBadgeClass(rank)}>{rank}</span>
                      </td>
                      <td className="px-4 py-2 font-bold text-gray-900">
                        {s.shopName}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {num(s.reservationCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {num(s.visitCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {num(s.joinCount)}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-600">
                        {pct(s.joinRate)}
                      </td>
                      <td className="px-3 py-2 text-right text-red-500">
                        {pct(s.cancelRate)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {yen(s.adSpend)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {s.visitCount > 0 ? yen(s.cpa) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">
                        {yen(s.sales)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`rounded px-1.5 py-0.5 font-medium ${
                            s.roas >= 1
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {s.adSpend > 0 ? pct(s.roas) : "-"}
                        </span>
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

function TotalTile({
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
