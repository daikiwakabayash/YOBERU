"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { RetentionData } from "../services/getRetentionData";
import {
  TrendingUp,
  TrendingDown,
  Users,
  RefreshCcw,
  Trophy,
  Calendar,
  AlertTriangle,
} from "lucide-react";

interface Props {
  data: RetentionData;
}

function yen(n: number): string {
  if (!n) return "¥0";
  return `¥${n.toLocaleString()}`;
}

function pct(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

function num(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString();
}

function fmtMD(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function RetentionTab({ data }: Props) {
  const t = data.totals;
  const churnRate = t.newJoinCount > 0 ? t.churnedCount / t.newJoinCount : 0;

  return (
    <div className="space-y-4">
      {/* サマリー hero cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroCard
          icon={<Users className="h-3.5 w-3.5 text-orange-500" />}
          iconBg="bg-orange-100"
          label="入会数 (1 回目購入)"
          value={`${num(t.newJoinCount)} 名`}
          sub={`期間内に新たに入会した顧客`}
        />
        <HeroCard
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
          iconBg="bg-emerald-100"
          label="継続率"
          value={pct(t.retentionRate)}
          sub={`継続中 ${num(t.activeCount)} 名 / ${num(t.newJoinCount)} 名`}
        />
        <HeroCard
          icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
          iconBg="bg-red-100"
          label="チャーン率"
          value={pct(churnRate)}
          sub={`離反 ${num(t.churnedCount)} 名`}
        />
        <HeroCard
          icon={<RefreshCcw className="h-3.5 w-3.5 text-blue-600" />}
          iconBg="bg-blue-100"
          label="平均購入回数"
          value={`${t.avgPurchaseCount.toFixed(2)} 回`}
          sub={`回数券 平均 ${t.avgTicketRenewals.toFixed(2)} 回更新 / サブスク 平均 ${t.avgSubscriptionMonths.toFixed(1)} ヶ月`}
        />
      </div>

      {/* 離反タイミング分布 + スタッフ別 + 媒体別 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 離反タイミング */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-gradient-to-r from-rose-50 to-pink-50 px-4 py-3 text-sm font-bold text-gray-800">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            離反タイミング (購入回数別)
          </div>
          {data.churnDistribution.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-muted-foreground">
              データなし
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.churnDistribution.map((d) => {
                const total = d.activeCount + d.churnedCount;
                const churnPct = total > 0 ? d.churnedCount / total : 0;
                return (
                  <li
                    key={d.purchaseCount}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="inline-flex h-6 w-10 items-center justify-center rounded-md bg-gray-100 text-[11px] font-bold text-gray-700">
                      {d.purchaseCount} 回
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-gray-500">
                          離反 {d.churnedCount} / 継続 {d.activeCount}
                        </span>
                        <span className="font-bold text-rose-600">
                          {pct(churnPct)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full bg-rose-400"
                          style={{ width: `${Math.min(100, churnPct * 100)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* スタッフ別継続率 */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm font-bold text-gray-800">
            <Trophy className="h-4 w-4 text-amber-500" />
            スタッフ別 継続率
          </div>
          {data.byStaff.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-muted-foreground">
              データなし
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.byStaff.map((r, i) => (
                <li
                  key={r.staffId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {r.staffName}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      入会 {r.newJoinCount} / 継続 {r.activeCount} / 平均{" "}
                      {r.avgPurchaseCount.toFixed(1)} 回
                    </div>
                  </div>
                  <div className="text-base font-black text-emerald-600">
                    {pct(r.retentionRate)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 媒体別 */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-gradient-to-r from-blue-50 to-sky-50 px-4 py-3 text-sm font-bold text-gray-800">
            <Calendar className="h-4 w-4 text-blue-500" />
            媒体別 継続率
          </div>
          {data.bySource.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-muted-foreground">
              データなし
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.bySource.map((r) => (
                <li
                  key={r.sourceId ?? "none"}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {r.sourceName}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      入会 {r.newJoinCount} / 継続 {r.activeCount}
                    </div>
                  </div>
                  <div className="text-base font-black text-blue-600">
                    {pct(r.retentionRate)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 顧客一覧 */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-slate-50 to-gray-50 px-4 py-3">
          <div className="text-sm font-bold text-gray-800">
            入会顧客一覧 ({num(data.rows.length)} 名)
          </div>
          <div className="text-[11px] text-gray-500">
            ※ 期間 / 媒体 / スタッフは上のフィルタで切替えてください
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-gradient-to-b from-gray-50 to-white shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <th className="border-b px-2 py-2.5">入会日</th>
                <th className="border-b px-2 py-2.5">担当</th>
                <th className="border-b px-2 py-2.5">媒体</th>
                <th className="border-b px-2 py-2.5">No.</th>
                <th className="border-b px-2 py-2.5">氏名</th>
                <th className="border-b px-2 py-2.5">初回プラン</th>
                <th className="border-b px-2 py-2.5 text-right">購入回数</th>
                <th className="border-b px-2 py-2.5 text-right">継続月数</th>
                <th className="border-b px-2 py-2.5 text-right">回数券更新</th>
                <th className="border-b px-2 py-2.5">状態</th>
                <th className="border-b px-2 py-2.5 text-right">累計売上</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    該当する入会顧客がありません
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.customerId} className="hover:bg-gray-50/60">
                    <td className="border-b px-2 py-2 align-top">
                      <div className="font-bold text-gray-900">
                        {fmtMD(r.firstPurchaseAt)}
                      </div>
                      <div className="font-mono text-[10px] text-gray-400">
                        {r.firstPurchaseDate}
                      </div>
                    </td>
                    <td className="border-b px-2 py-2 align-top text-gray-700">
                      {r.firstStaffName || "-"}
                    </td>
                    <td className="border-b px-2 py-2 align-top text-[11px] text-gray-700">
                      {r.firstVisitSourceName || (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 align-top">
                      {r.customerCode ? (
                        <Link
                          href={`/customer/${r.customerId}/record`}
                          className="font-mono text-[11px] font-bold text-blue-600 underline-offset-2 hover:underline"
                        >
                          {r.customerCode}
                        </Link>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 align-top">
                      <Link
                        href={`/customer/${r.customerId}/record`}
                        className="font-bold text-gray-900 underline-offset-2 hover:text-blue-600 hover:underline"
                      >
                        {r.customerName || "(無名)"}
                      </Link>
                    </td>
                    <td className="border-b px-2 py-2 align-top">
                      <span
                        className={`mr-1 inline-flex rounded px-1 py-px text-[9px] font-bold ${
                          r.firstPlanType === "subscription"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {r.firstPlanType === "subscription" ? "サブスク" : "回数券"}
                      </span>
                      <span className="text-gray-700">{r.firstPlanName}</span>
                    </td>
                    <td className="border-b px-2 py-2 text-right align-top">
                      <span className="text-base font-black text-gray-900">
                        {r.purchaseCount}
                      </span>
                      <span className="ml-0.5 text-[10px] text-gray-400">回</span>
                    </td>
                    <td className="border-b px-2 py-2 text-right align-top">
                      {r.subscriptionMonths != null ? (
                        <>
                          <span className="font-bold text-purple-700">
                            {r.subscriptionMonths.toFixed(1)}
                          </span>
                          <span className="ml-0.5 text-[10px] text-gray-400">
                            ヶ月
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 text-right align-top">
                      {r.ticketRenewals != null ? (
                        <>
                          <span className="font-bold text-emerald-700">
                            {r.ticketRenewals}
                          </span>
                          <span className="ml-0.5 text-[10px] text-gray-400">
                            回
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {r.churnLabel}
                      </span>
                    </td>
                    <td className="border-b px-2 py-2 text-right align-top font-bold text-emerald-700">
                      {yen(r.totalSpent)}
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

function HeroCard({
  icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconBg}`}
        >
          {icon}
        </span>
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <div className="mt-1.5 text-xl font-black leading-tight text-gray-900">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div>
    </Card>
  );
}
