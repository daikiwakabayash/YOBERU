"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import type {
  CreativeBucket,
  CreativeAnalysisData,
} from "../services/getCreativeAnalysis";
import { yen, pct, num } from "./format";
import { Sparkles, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

interface MarketingCreativeAnalysisProps {
  data: CreativeAnalysisData;
}

type SortKey =
  | "shopName"
  | "visitSourceName"
  | "symptomName"
  | "offerPrice"
  | "reservationCount"
  | "visitCount"
  | "joinCount"
  | "joinRate"
  | "cancelRate"
  | "adSpend"
  | "cpa"
  | "sales"
  | "roas";

type SortDir = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "shopName", label: "店舗", align: "left" },
  { key: "visitSourceName", label: "媒体", align: "left" },
  { key: "symptomName", label: "症状", align: "left" },
  { key: "offerPrice", label: "オファー", align: "right" },
  { key: "reservationCount", label: "予約数", align: "right" },
  { key: "visitCount", label: "実来院", align: "right" },
  { key: "joinCount", label: "入会数", align: "right" },
  { key: "joinRate", label: "入会率", align: "right" },
  { key: "cancelRate", label: "キャンセル率", align: "right" },
  { key: "adSpend", label: "広告費", align: "right" },
  { key: "cpa", label: "CPA", align: "right" },
  { key: "sales", label: "売上", align: "right" },
  { key: "roas", label: "ROAS", align: "right" },
];

function valueOf(row: CreativeBucket, key: SortKey): number | string | null {
  switch (key) {
    case "shopName":
      return row.shopName;
    case "visitSourceName":
      return row.visitSourceName;
    case "symptomName":
      return row.symptomName ?? row.symptom;
    default:
      return row[key];
  }
}

function compareValues(
  a: number | string | null,
  b: number | string | null
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // null は常に末尾
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ja");
}

/**
 * クリエイティブ分析タブ:
 *   行 = (店舗 × 媒体 × 症状 × オファー価格) ピボット
 *   列 = 予約数 / 実来院 / 入会数 / 入会率 / キャンセル率 / 広告費 / CPA / 売上 / ROAS
 *
 * 同じ (店舗, 媒体, 症状, オファー価格) に複数の強制リンクが紐付いている場合
 * (= A/B テスト用のクリエイティブが複数) は 1 行に合算する。
 * 内訳リンクは bookingLinkTitles のツールチップで確認できる。
 *
 * 全列クリックで昇降順切替 (初回降順、再クリックで昇順、もう一度で降順)。
 */
export function MarketingCreativeAnalysis({
  data,
}: MarketingCreativeAnalysisProps) {
  const { rows, totals } = data;
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 文字列列は asc から、数値列は desc から (見たい順)
      const isText =
        key === "shopName" ||
        key === "visitSourceName" ||
        key === "symptomName";
      setSortDir(isText ? "asc" : "desc");
    }
  }

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const cmp = compareValues(valueOf(a, sortKey), valueOf(b, sortKey));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      {/* Totals strip */}
      <Card className="overflow-hidden border-orange-200/60">
        <div className="grid grid-cols-2 gap-4 bg-gradient-to-r from-orange-50 to-amber-50/40 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <TotalTile label="クリエイティブ" value={`${num(rows.length)}件`} />
          <TotalTile label="新規 / 実来院" value={`${num(totals.visitCount)}名`} />
          <TotalTile label="入会数" value={`${num(totals.joinCount)}名`} />
          <TotalTile
            label="入会率"
            value={pct(totals.joinRate)}
            tone="text-blue-600"
          />
          <TotalTile
            label="キャンセル率"
            value={pct(totals.cancelRate)}
            tone="text-rose-600"
          />
          <TotalTile label="広告費 / CPA" value={`${yen(totals.adSpend)} / ${yen(totals.cpa)}`} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-gradient-to-r from-fuchsia-50/40 to-orange-50/40 px-5 py-3">
          <Sparkles className="h-4 w-4 text-fuchsia-500" />
          <div className="text-sm font-bold text-gray-900">
            クリエイティブ別内訳 (店舗 × 媒体 × 症状 × オファー価格)
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {COLUMNS.map((col) => {
                  const isActive = col.key === sortKey;
                  const Icon = isActive
                    ? sortDir === "asc"
                      ? ArrowUp
                      : ArrowDown
                    : ArrowUpDown;
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-2 font-medium ${
                        col.align === "left" ? "text-left" : "text-right"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 hover:text-gray-900 ${
                          col.align === "right" ? "ml-auto" : ""
                        } ${isActive ? "text-gray-900" : ""}`}
                      >
                        <span>{col.label}</span>
                        <Icon
                          className={`h-3 w-3 ${
                            isActive ? "opacity-100" : "opacity-30"
                          }`}
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="py-10 text-center text-muted-foreground"
                  >
                    <div className="space-y-2">
                      <div>
                        対象クリエイティブがありません。強制リンクに「症状」「オファー価格」を入力するとここに表示されます。
                      </div>
                      <div className="mx-auto max-w-xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] text-amber-900">
                        <div className="font-bold">予約があるのに 0 件と出る場合</div>
                        <div className="mt-1">
                          appointments テーブルに <code className="rounded bg-amber-100 px-1 font-mono">booking_link_id</code> カラムが必要です。
                          Supabase の SQL Editor で
                          <code className="mx-1 rounded bg-amber-100 px-1 font-mono">
                            supabase/migrations/00052_appointments_booking_link_id.sql
                          </code>
                          を実行してください。実行以降に作られた予約からこのタブに反映されます。
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => <Row key={r.key} row={r} />)
              )}
            </tbody>
            {sortedRows.length > 0 && (
              <tfoot className="bg-orange-50/50 font-semibold">
                <tr>
                  <td className="px-3 py-2 text-left" colSpan={4}>合計</td>
                  <td className="px-3 py-2 text-right">{num(totals.reservationCount)}</td>
                  <td className="px-3 py-2 text-right">{num(totals.visitCount)}</td>
                  <td className="px-3 py-2 text-right">{num(totals.joinCount)}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{pct(totals.joinRate)}</td>
                  <td className="px-3 py-2 text-right text-rose-600">{pct(totals.cancelRate)}</td>
                  <td className="px-3 py-2 text-right">{yen(totals.adSpend)}</td>
                  <td className="px-3 py-2 text-right">{yen(totals.cpa)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{yen(totals.sales)}</td>
                  <td className="px-3 py-2 text-right">
                    {totals.adSpend > 0 ? totals.roas.toFixed(2) : "-"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ row }: { row: CreativeBucket }) {
  const linksTooltip = row.bookingLinkTitles.join("\n");
  return (
    <tr className="hover:bg-orange-50/30">
      <td className="px-3 py-2 text-gray-700">{row.shopName ?? "(店舗未指定)"}</td>
      <td className="px-3 py-2 text-gray-700">
        {row.visitSourceName ? (
          <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            {row.visitSourceName}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {row.symptom ? (
          <span className="inline-flex items-center rounded-md bg-fuchsia-50 px-2 py-0.5 text-xs font-medium text-fuchsia-700">
            {row.symptomName ?? row.symptom}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-gray-700">
        {row.offerPrice != null ? `¥${row.offerPrice.toLocaleString()}` : "—"}
        <div
          className="mt-0.5 text-[10px] text-gray-400"
          title={linksTooltip}
        >
          ▸ {row.bookingLinkIds.length} 件のリンク
        </div>
      </td>
      <td className="px-3 py-2 text-right">{num(row.reservationCount)}</td>
      <td className="px-3 py-2 text-right">{num(row.visitCount)}</td>
      <td className="px-3 py-2 text-right">{num(row.joinCount)}</td>
      <td className="px-3 py-2 text-right text-blue-600">
        {row.visitCount > 0 ? pct(row.joinRate) : "-"}
      </td>
      <td className="px-3 py-2 text-right text-rose-600">
        {row.reservationCount > 0 ? pct(row.cancelRate) : "-"}
      </td>
      <td className="px-3 py-2 text-right">{yen(row.adSpend)}</td>
      <td className="px-3 py-2 text-right">
        {row.visitCount > 0 && row.adSpend > 0 ? yen(row.cpa) : "-"}
      </td>
      <td className="px-3 py-2 text-right text-emerald-700">{yen(row.sales)}</td>
      <td className="px-3 py-2 text-right">
        {row.adSpend > 0 ? row.roas.toFixed(2) : "-"}
      </td>
    </tr>
  );
}

function TotalTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold ${tone ?? "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}
