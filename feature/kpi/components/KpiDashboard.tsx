import { Card } from "@/components/ui/card";
import type { KpiData } from "../services/getKpiData";
import {
  yen,
  pct,
  num,
  rankBadgeClass,
} from "@/feature/marketing/components/format";
import {
  DollarSign,
  Sparkles,
  RefreshCcw,
  UserMinus,
  Users,
  Target,
  MessageSquare,
  Trophy,
  Crown,
} from "lucide-react";

interface KpiDashboardProps {
  data: KpiData;
}

/**
 * 経営指標 ダッシュボード.
 *
 * Layout (top → bottom):
 *  1. 8 large KPI cards (total / new / continuing sales + churn + new
 *     acquisitions + join rate + reviews).
 *  2. 3 ranking cards (生産性 TOP10 / 入会率 TOP10 / 退会率が低い).
 *
 * Hero card color-coding:
 *  - Sales cards = emerald
 *  - Acquisition = orange
 *  - Join rate   = blue
 *  - Churn       = red
 *  - Reviews     = purple / pink
 */
export function KpiDashboard({ data }: KpiDashboardProps) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      {/* Primary hero row — 4 sales/acquisition cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroCard
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          iconBg="bg-emerald-100"
          label="総売上 (税込)"
          topRightLabel="合計実績"
          value={yen(t.totalSales)}
          subtext={`完了 ${num(t.completedCount)} 件`}
        />
        <HeroCard
          icon={<Sparkles className="h-4 w-4 text-orange-500" />}
          iconBg="bg-orange-100"
          label="新規売上"
          topRightLabel="新規獲得"
          value={yen(t.newSales)}
          subtext={`${num(t.totalAcquired)} 名を新規獲得`}
        />
        <HeroCard
          icon={<RefreshCcw className="h-4 w-4 text-blue-600" />}
          iconBg="bg-blue-100"
          label="継続売上"
          topRightLabel="LTV"
          value={yen(t.continuingSales)}
          subtext={`リピーター構成`}
        />
        <HeroCard
          icon={<UserMinus className="h-4 w-4 text-red-500" />}
          iconBg="bg-red-100"
          label="退会率"
          topRightLabel="維持率"
          value={pct(t.churnRate)}
          subtext={`${num(t.churnCount)} 名退会`}
        />
      </div>

      {/* Secondary hero row — acquisition + engagement + reviews */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroCard
          icon={<Users className="h-4 w-4 text-orange-500" />}
          iconBg="bg-orange-100"
          label="総新規数"
          topRightLabel="集客数"
          value={`${num(t.totalAcquired)} 名`}
          subtext={`予約 ${num(t.reservationCount)} 件`}
        />
        <HeroCard
          icon={<Target className="h-4 w-4 text-amber-500" />}
          iconBg="bg-amber-100"
          label="入会率"
          topRightLabel="成約率"
          value={`${pct(t.joinRate)} (${num(t.joinCount)}名)`}
          subtext={`${num(t.joinCount)} 名入会`}
        />
        <HeroCard
          icon={<MessageSquare className="h-4 w-4 text-slate-600" />}
          iconBg="bg-slate-100"
          label="G口コミ (合計)"
          topRightLabel="GOOGLE"
          value={`${num(t.googleReviews)} 件`}
          subtext="外部連携 準備中"
        />
        <HeroCard
          icon={<MessageSquare className="h-4 w-4 text-pink-600" />}
          iconBg="bg-pink-100"
          label="H口コミ (合計)"
          topRightLabel="HOTPEPPER"
          value={`${num(t.hotpepperReviews)} 件`}
          subtext="外部連携 準備中"
        />
      </div>

      {/* Ranking cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankingCard
          title="生産性 (売上)"
          accent="from-orange-50 to-amber-50"
          icon={<Trophy className="h-4 w-4 text-amber-500" />}
          emptyLabel="完了予約がまだありません"
          rows={data.rankings.productivity.map((r, i) => ({
            key: r.staffId,
            rank: i + 1,
            primary: r.staffName,
            secondary: `${num(r.count)} 件`,
            value: yen(r.sales),
          }))}
        />
        <RankingCard
          title="入会率 TOP10"
          accent="from-blue-50 to-sky-50"
          icon={<Target className="h-4 w-4 text-blue-500" />}
          emptyLabel="有意な入会データがまだありません (最低 3 件)"
          rows={data.rankings.joinRate.map((r, i) => ({
            key: r.staffId,
            rank: i + 1,
            primary: r.staffName,
            secondary: `${num(r.joinCount)} / ${num(r.total)} 件`,
            value: pct(r.joinRate),
          }))}
        />
        <RankingCard
          title="退会率が低いスタッフ"
          accent="from-emerald-50 to-teal-50"
          icon={<Crown className="h-4 w-4 text-emerald-500" />}
          emptyLabel="スタッフ単位の退会計測は準備中"
          rows={data.rankings.churnLow.map((r, i) => ({
            key: r.staffId,
            rank: i + 1,
            primary: r.staffName,
            secondary: "",
            value: pct(r.churnRate),
          }))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
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
  return (
    <Card className="relative overflow-hidden p-3">
      <div className="absolute right-3 top-2.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">
        {topRightLabel}
      </div>
      <div
        className={`mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}
      >
        {icon}
      </div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-0.5 text-lg font-black leading-tight text-gray-900">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-gray-400">{subtext}</div>
    </Card>
  );
}

function RankingCard({
  title,
  accent,
  icon,
  rows,
  emptyLabel,
}: {
  title: string;
  accent: string;
  icon: React.ReactNode;
  rows: Array<{
    key: number;
    rank: number;
    primary: string;
    secondary: string;
    value: string;
  }>;
  emptyLabel: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className={`flex items-center gap-2 border-b bg-gradient-to-r ${accent} px-4 py-3 text-sm font-bold text-gray-800`}
      >
        {icon}
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60"
            >
              <span className={rankBadgeClass(r.rank)}>{r.rank}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-gray-900">
                  {r.primary}
                </div>
                {r.secondary && (
                  <div className="truncate text-[11px] text-gray-400">
                    {r.secondary}
                  </div>
                )}
              </div>
              <div className="text-base font-black text-gray-900">
                {r.value}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
