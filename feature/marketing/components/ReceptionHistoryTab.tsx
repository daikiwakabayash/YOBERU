"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import type { ReceptionHistoryData } from "../services/getReceptionHistory";

interface Props {
  data: ReceptionHistoryData;
  onlyNew: boolean;
  onlyMemberJoin: boolean;
}

const STATUS_LABEL: Record<number, { label: string; cls: string }> = {
  0: { label: "待機", cls: "bg-gray-100 text-gray-700" },
  1: { label: "施術中", cls: "bg-amber-100 text-amber-700" },
  2: { label: "完了", cls: "bg-emerald-100 text-emerald-700" },
  3: { label: "キャンセル", cls: "bg-red-100 text-red-700" },
  4: { label: "当キャン", cls: "bg-red-100 text-red-700" },
  99: { label: "no-show", cls: "bg-red-100 text-red-700" },
};

function yen(n: number): string {
  if (!n) return "-";
  return `¥${n.toLocaleString()}`;
}

function fmtDate(iso: string): { md: string; weekday: string; cls: string } {
  const d = new Date(iso + "T00:00:00");
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const cls =
    d.getDay() === 0
      ? "text-red-500"
      : d.getDay() === 6
        ? "text-blue-500"
        : "text-gray-500";
  return { md, weekday: wd, cls };
}

export function ReceptionHistoryTab({ data, onlyNew, onlyMemberJoin }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const toggle = useCallback(
    (key: "onlyNew" | "onlyJoin", checked: boolean) => {
      const next = new URLSearchParams(params.toString());
      if (checked) next.set(key, "1");
      else next.delete(key);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  // 集計サマリー (フィルタ後)
  // 売上 / 新規来店 / 入会 は「完了 (status=2)」限定で集計する。
  // - キャンセル予約に最古フラグが立っていても新規来店にカウントしない
  // - キャンセル予約の sales / consumed_amount も集計に乗せない
  // - is_member_join がキャンセル予約に立っていても入会にカウントしない
  // 件数 (= 受付件数) / 完了件数 だけは全 status 母集団でそのまま表示。
  const summary = useMemo(() => {
    let total = 0;
    let newSales = 0;
    let continuingSales = 0;
    let consumed = 0;
    let memberJoinCount = 0;
    let firstVisitCount = 0;
    let completed = 0;
    for (const r of data.rows) {
      if (r.status === 2) {
        completed += 1;
        total += r.sales;
        if (r.classification === "new") newSales += r.sales;
        else continuingSales += r.sales;
        consumed += r.consumedAmount;
        if (r.isMemberJoin) memberJoinCount += 1;
        if (r.isFirstEverVisit) firstVisitCount += 1;
      }
    }
    return {
      rowCount: data.rows.length,
      completed,
      total,
      newSales,
      continuingSales,
      consumed,
      memberJoinCount,
      firstVisitCount,
    };
  }, [data.rows]);

  return (
    <div className="space-y-3">
      {/* フィルタ + サマリー */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-xs font-bold text-gray-500">追加フィルタ:</div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyNew}
              onChange={(e) => toggle("onlyNew", e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-orange-500"
            />
            <span className="font-medium text-gray-700">新規のみ</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMemberJoin}
              onChange={(e) => toggle("onlyJoin", e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-amber-500"
            />
            <span className="font-medium text-gray-700">入会のみ</span>
          </label>
          <span className="text-[11px] text-gray-400">
            ※ 期間 / 担当スタッフは上のフィルタで切替えてください
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
          <SummaryChip label="件数" value={`${summary.rowCount} 件`} />
          <SummaryChip label="完了" value={`${summary.completed} 件`} />
          <SummaryChip
            label="新規来店"
            value={`${summary.firstVisitCount} 件`}
            tone="orange"
          />
          <SummaryChip
            label="入会"
            value={`${summary.memberJoinCount} 件`}
            tone="amber"
          />
          <SummaryChip label="新規売上" value={yen(summary.newSales)} tone="orange" />
          <SummaryChip
            label="継続売上"
            value={yen(summary.continuingSales)}
            tone="blue"
          />
          <SummaryChip label="合計売上" value={yen(summary.total)} tone="emerald" />
        </div>
      </Card>

      {/* 明細テーブル */}
      <Card className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-gradient-to-b from-gray-50 to-white shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <th className="border-b px-2 py-2.5">日付</th>
                <th className="border-b px-2 py-2.5">担当</th>
                <th className="border-b px-2 py-2.5">No.</th>
                <th className="border-b px-2 py-2.5">氏名</th>
                <th className="border-b px-2 py-2.5">区分</th>
                <th className="border-b px-2 py-2.5">入会</th>
                <th className="border-b px-2 py-2.5">プラン購入</th>
                <th className="border-b px-2 py-2.5 text-right">売上</th>
                <th className="border-b px-2 py-2.5 text-right">消化</th>
                <th className="border-b px-2 py-2.5">決済</th>
                <th className="border-b px-2 py-2.5">媒体</th>
                <th className="border-b px-2 py-2.5">状態</th>
                <th className="border-b px-2 py-2.5">メモ</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    該当する受付がありません
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => {
                  const dt = fmtDate(r.date);
                  const status = STATUS_LABEL[r.status] ?? STATUS_LABEL[0];
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="border-b px-2 py-2 align-top">
                        <div className="flex items-baseline gap-1">
                          <span className="font-bold text-gray-900">{dt.md}</span>
                          <span className={`text-[10px] font-bold ${dt.cls}`}>
                            ({dt.weekday})
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">
                          {r.date}
                        </div>
                      </td>
                      <td className="border-b px-2 py-2 align-top text-gray-700">
                        {r.staffName || "-"}
                      </td>
                      <td className="border-b px-2 py-2 align-top">
                        {r.customerId && r.customerCode ? (
                          <Link
                            href={`/customer/${r.customerId}/record`}
                            className="font-mono text-[11px] font-bold text-blue-600 underline-offset-2 hover:underline"
                          >
                            {r.customerCode}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11px] text-gray-400">
                            {r.customerCode ?? "-"}
                          </span>
                        )}
                      </td>
                      <td className="border-b px-2 py-2 align-top">
                        {r.customerId ? (
                          <Link
                            href={`/customer/${r.customerId}/record`}
                            className="font-bold text-gray-900 underline-offset-2 hover:text-blue-600 hover:underline"
                          >
                            {r.customerName || "(無名)"}
                          </Link>
                        ) : (
                          <span className="text-gray-700">{r.customerName}</span>
                        )}
                      </td>
                      <td className="border-b px-2 py-2 align-top">
                        <ClassificationBadge
                          cls={r.classification}
                          isFirstVisit={r.isFirstEverVisit}
                        />
                      </td>
                      <td className="border-b px-2 py-2 align-top">
                        {r.isMemberJoin ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            入会
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="border-b px-2 py-2 align-top">
                        {r.plans.length === 0 ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <div className="space-y-0.5">
                            {r.plans.map((p, i) => (
                              <div key={i} className="text-[11px]">
                                <span
                                  className={`mr-1 inline-flex rounded px-1 py-px text-[9px] font-bold ${
                                    p.isFirstPlan
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {p.isFirstPlan ? "初回" : "更新"}
                                </span>
                                <span className="text-gray-700">{p.name}</span>
                                <span className="ml-1 font-bold text-gray-900">
                                  ¥{p.price.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="border-b px-2 py-2 text-right align-top font-bold text-emerald-700">
                        {yen(r.sales)}
                      </td>
                      <td className="border-b px-2 py-2 text-right align-top text-cyan-700">
                        {yen(r.consumedAmount)}
                      </td>
                      <td className="border-b px-2 py-2 align-top text-[11px] text-gray-700">
                        {r.paymentSummary || (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="border-b px-2 py-2 align-top text-[11px] text-gray-700">
                        {r.visitSourceName || (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="border-b px-2 py-2 align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="border-b px-2 py-2 align-top text-[11px] text-gray-500">
                        <span
                          className="line-clamp-2 max-w-[28ch] break-words"
                          title={r.memo}
                        >
                          {r.memo || "-"}
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

function ClassificationBadge({
  cls,
  isFirstVisit,
}: {
  cls: "new" | "continuing";
  isFirstVisit: boolean;
}) {
  // 売上分類 (= 初回プラン購入かどうか) を主表記、来店区分はサブで表示
  if (cls === "new") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
          新規
        </span>
        {isFirstVisit ? (
          <span className="text-[9px] text-gray-400">初来店</span>
        ) : (
          <span className="text-[9px] text-gray-400">2回目以降</span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex w-fit rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
        継続
      </span>
      <span className="text-[9px] text-gray-400">プラン更新</span>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "orange" | "blue" | "emerald" | "amber";
}) {
  const toneCls = {
    gray: "bg-gray-50 text-gray-700 ring-gray-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  }[tone];
  return (
    <div className={`flex flex-col rounded-md px-3 py-2 ring-1 ${toneCls}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
        {label}
      </span>
      <span className="text-sm font-black">{value}</span>
    </div>
  );
}
