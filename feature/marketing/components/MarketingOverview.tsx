import type { MarketingData } from "../services/getMarketingData";
import type { LineFriendStats } from "../services/getLineFriendStats";
import { Card } from "@/components/ui/card";
import {
  Users,
  DollarSign,
  Target,
  AlertTriangle,
  TrendingUp,
  MessageCircle,
} from "lucide-react";

interface MarketingOverviewProps {
  data: MarketingData;
  lineFriendStats?: LineFriendStats;
}

function yen(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "¥0";
  return `¥${Math.round(n).toLocaleString()}`;
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(0)}%`;
}

function num(n: number): string {
  return (Math.round(n) || 0).toLocaleString();
}

/**
 * Hero cards: 集客 / CPA / 入会率 / キャンセル率 + secondary row of
 * 広告費 / 売上 / ROAS / 平均客単価.
 */
export function MarketingOverview({
  data,
  lineFriendStats,
}: MarketingOverviewProps) {
  const t = data.totals;
  return (
    <div className="space-y-4">
      {/* Primary hero row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeroCard
          icon={<Users className="h-3 w-3 text-orange-600" />}
          iconBg="bg-orange-100"
          label="実来院数"
          topRightLabel="集客"
          value={`${num(t.visitCount)}名`}
          subtext={`予約 ${num(t.reservationCount)}名`}
        />
        <HeroCard
          icon={<DollarSign className="h-3 w-3 text-green-600" />}
          iconBg="bg-green-100"
          label="平均CPA"
          topRightLabel="CPA"
          value={yen(t.cpa)}
          subtext={`広告費 ${yen(t.adSpend)}`}
        />
        <HeroCard
          icon={<Target className="h-3 w-3 text-blue-600" />}
          iconBg="bg-blue-100"
          label="入会率"
          topRightLabel="成約"
          value={pct(t.joinRate)}
          subtext={`${num(t.joinCount)}名入会`}
        />
        <HeroCard
          icon={<AlertTriangle className="h-3 w-3 text-red-500" />}
          iconBg="bg-red-100"
          label="キャンセル率"
          topRightLabel="注意"
          value={pct(t.cancelRate)}
          subtext={`${num(t.cancelCount)}名キャンセル`}
        />
      </div>

      {/* LINE friend hero row — 友だち化率は CAC 回収期間に直結するので
          独立のセクションで強調する */}
      {lineFriendStats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HeroCard
            icon={<MessageCircle className="h-3 w-3 text-emerald-600" />}
            iconBg="bg-emerald-100"
            label="LINE友だち化率 (全体)"
            topRightLabel="リテンション"
            value={pct(lineFriendStats.friendRate)}
            subtext={`${num(lineFriendStats.lineFriends)}名 / 全 ${num(
              lineFriendStats.totalCustomers
            )}名`}
          />
          <HeroCard
            icon={<MessageCircle className="h-3 w-3 text-emerald-600" />}
            iconBg="bg-emerald-100"
            label="当月新規の友だち化率"
            topRightLabel="導線効果"
            value={pct(lineFriendStats.newCustomerFriendRate)}
            subtext={
              lineFriendStats.newCustomerTotal > 0
                ? `当月新規 ${num(lineFriendStats.newCustomerTotal)}名中`
                : "当月の新規顧客はまだいません"
            }
          />
        </div>
      )}

      {/* Secondary pastel row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MiniCard
          label="広告費合計"
          value={yen(t.adSpend)}
          tone="bg-red-50 border-red-100"
        />
        <MiniCard
          label="売上合計"
          value={yen(t.sales)}
          tone="bg-emerald-50 border-emerald-100"
        />
        <MiniCard
          label="ROAS"
          value={t.adSpend > 0 ? pct(t.roas) : "-"}
          tone="bg-blue-50 border-blue-100"
        />
        <MiniCard
          label="平均客単価"
          value={yen(t.avgPrice)}
          tone="bg-amber-50 border-amber-100"
        />
        <MiniCard
          label="口コミ数"
          value={`${num(t.reviewCount)}件`}
          tone="bg-gray-50 border-gray-100"
        />
      </div>

      {/* 広告 API 連携指標 (Impressions / Clicks / CTR / CVR / CPM) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MiniCard
          label="Impression"
          value={t.impressions > 0 ? num(t.impressions) : "-"}
          tone="bg-purple-50 border-purple-100"
        />
        <MiniCard
          label="クリック数"
          value={t.clicks > 0 ? num(t.clicks) : "-"}
          tone="bg-indigo-50 border-indigo-100"
        />
        <MiniCard
          label="CTR"
          value={t.ctr > 0 ? `${t.ctr.toFixed(2)}%` : "-"}
          tone="bg-cyan-50 border-cyan-100"
        />
        <MiniCard
          label="CVR"
          value={t.cvr > 0 ? `${t.cvr.toFixed(2)}%` : "-"}
          tone="bg-teal-50 border-teal-100"
        />
        <MiniCard
          label="CPM"
          value={t.cpm > 0 ? `¥${Math.round(t.cpm).toLocaleString()}` : "-"}
          tone="bg-fuchsia-50 border-fuchsia-100"
        />
      </div>

      {/* Monthly trend table */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-r from-orange-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <TrendingUp className="mr-1.5 inline h-4 w-4 text-orange-500" />
          月別推移
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">月</th>
                <th className="px-3 py-2 text-right font-medium">予約数</th>
                <th className="px-3 py-2 text-right font-medium">実来院</th>
                <th className="px-3 py-2 text-right font-medium">入会数</th>
                <th className="px-3 py-2 text-right font-medium">入会率</th>
                <th className="px-3 py-2 text-right font-medium">キャンセル</th>
                <th className="px-3 py-2 text-right font-medium">C率</th>
                <th className="px-3 py-2 text-right font-medium">広告費</th>
                <th className="px-3 py-2 text-right font-medium">CPA</th>
                <th className="px-3 py-2 text-right font-medium">売上</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.byMonth.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-6 text-center text-muted-foreground"
                  >
                    期間内のデータがありません
                  </td>
                </tr>
              ) : (
                data.byMonth.map((m) => (
                  <tr key={m.yearMonth} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {m.yearMonth}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {num(m.reservationCount)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {num(m.visitCount)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {num(m.joinCount)}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-600">
                      {pct(m.joinRate)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {num(m.cancelCount)}
                    </td>
                    <td className="px-3 py-2 text-right text-red-500">
                      {pct(m.cancelRate)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {yen(m.adSpend)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {m.visitCount > 0 ? yen(m.cpa) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700">
                      {yen(m.sales)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          m.roas >= 1
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {m.adSpend > 0 ? pct(m.roas) : "-"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* By source breakdown */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-r from-blue-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          媒体別内訳
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">媒体</th>
                <th className="px-3 py-2 text-right font-medium">予約数</th>
                <th className="px-3 py-2 text-right font-medium">実来院</th>
                <th className="px-3 py-2 text-right font-medium">入会</th>
                <th className="px-3 py-2 text-right font-medium">入会率</th>
                <th className="px-3 py-2 text-right font-medium">C数</th>
                <th className="px-3 py-2 text-right font-medium">C率</th>
                <th className="px-3 py-2 text-right font-medium">広告費</th>
                <th className="px-3 py-2 text-right font-medium">CPA</th>
                <th className="px-3 py-2 text-right font-medium">売上</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.bySource.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-6 text-center text-muted-foreground"
                  >
                    媒体データがありません
                  </td>
                </tr>
              ) : (
                data.bySource.map((s) => (
                  <tr key={s.visitSourceId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {s.sourceName ?? "(不明)"}
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
                    <td className="px-3 py-2 text-right text-gray-700">
                      {num(s.cancelCount)}
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
                    <td className="px-3 py-2 text-right font-medium text-emerald-700">
                      {yen(s.sales)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          s.roas >= 1
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {s.adSpend > 0 ? pct(s.roas) : "-"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function HeroCard({
  icon,
  iconBg,
  label,
  topRightLabel,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  topRightLabel: string;
  value: string;
  subtext: string;
}) {
  // MiniCard と同じくらいの寸法にまで圧縮。縦横どちらも占有が半分
  // 以下になるので、概要タブ上部のカード行がタイトに並ぶ。
  return (
    <Card className="relative overflow-hidden p-2.5">
      <div className="absolute right-2 top-2 text-[9px] font-bold uppercase tracking-wider text-gray-400">
        {topRightLabel}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${iconBg}`}
        >
          {icon}
        </span>
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <div className="mt-1 text-base font-black leading-tight text-gray-900">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-gray-400">{subtext}</div>
    </Card>
  );
}

function MiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-base font-black text-gray-900">{value}</div>
    </div>
  );
}
