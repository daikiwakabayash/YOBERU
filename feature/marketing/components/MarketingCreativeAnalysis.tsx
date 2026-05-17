"use client";

import { Card } from "@/components/ui/card";
import type {
  CreativeBucket,
  CreativeAnalysisData,
} from "../services/getCreativeAnalysis";
import { yen, pct, num } from "./format";
import { Sparkles } from "lucide-react";

interface MarketingCreativeAnalysisProps {
  data: CreativeAnalysisData;
}

/**
 * クリエイティブ分析タブ:
 *   行 = (症状 × オファー価格 × 店舗) ピボット
 *   列 = 予約数 / 実来院 / 入会数 / 入会率 / キャンセル率 / 広告費 / CPA / 売上 / ROAS
 *
 * 同じ (症状, オファー価格, 店舗) に複数の強制リンクが紐付いている場合
 * (= A/B テスト用のクリエイティブが複数) は 1 行に合算する。
 * 内訳リンクは bookingLinkTitles のツールチップで確認できる。
 */
export function MarketingCreativeAnalysis({
  data,
}: MarketingCreativeAnalysisProps) {
  const { rows, totals } = data;
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
            クリエイティブ別内訳 (症状 × オファー価格 × 店舗)
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">店舗</th>
                <th className="px-3 py-2 text-left font-medium">症状</th>
                <th className="px-3 py-2 text-right font-medium">オファー</th>
                <th className="px-3 py-2 text-right font-medium">予約数</th>
                <th className="px-3 py-2 text-right font-medium">実来院</th>
                <th className="px-3 py-2 text-right font-medium">入会数</th>
                <th className="px-3 py-2 text-right font-medium">入会率</th>
                <th className="px-3 py-2 text-right font-medium">キャンセル率</th>
                <th className="px-3 py-2 text-right font-medium">広告費</th>
                <th className="px-3 py-2 text-right font-medium">CPA</th>
                <th className="px-3 py-2 text-right font-medium">売上</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="py-10 text-center text-muted-foreground"
                  >
                    対象クリエイティブがありません。強制リンクに「症状」「オファー価格」を入力するとここに表示されます。
                  </td>
                </tr>
              ) : (
                rows.map((r) => <Row key={r.key} row={r} />)
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-orange-50/50 font-semibold">
                <tr>
                  <td className="px-3 py-2 text-left" colSpan={3}>合計</td>
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
