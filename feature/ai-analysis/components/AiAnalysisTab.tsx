"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Megaphone,
  FileText,
  Lightbulb,
  AlertTriangle,
  Loader2,
  Save,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { generateMarketingAnalysis } from "../actions/aiAnalysisActions";
import { saveAnalysisRun } from "../actions/aiAnalysisHistoryActions";
import type { MarketingAnalysisResult } from "../services/runMarketingAnalysis";
import { AnalysisHistoryPanel } from "./AnalysisHistoryPanel";

interface Props {
  startMonth: string;
  endMonth: string;
}

/**
 * AI 分析タブ。ボタンを押すと現在の店舗 / 期間で
 * generateMarketingAnalysis (= aggregateMarketingContext + Claude) を
 * 走らせ、メタ広告 / チラシ / クリエイティブ仮説を表示する。
 *
 * Anthropic API は秒単位のレイテンシなので楽観 UI は使わず、
 * useTransition で「分析中…」スピナーを出す。
 */
export function AiAnalysisTab({ startMonth, endMonth }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MarketingAnalysisResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 分析結果を ai_analysis_runs に保存したかどうか。保存後は再度押せない
  // ようにする (= 同じ分析を重複保存させない)。新しく再分析を回すと
  // ローカル state がリセットされ、また保存できる。
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [savePending, startSaveTransition] = useTransition();

  function run() {
    setError(null);
    setSavedRunId(null);
    startTransition(async () => {
      const r = await generateMarketingAnalysis({ startMonth, endMonth });
      if (!r.ok) {
        setError(r.error);
        toast.error("AI 分析に失敗しました");
        return;
      }
      setResult(r.result);
      setGeneratedAt(r.generatedAt);
      toast.success("分析が完了しました");
    });
  }

  function save() {
    if (!result) return;
    startSaveTransition(async () => {
      const r = await saveAnalysisRun({
        startMonth,
        endMonth,
        result,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSavedRunId(r.runId);
      toast.success(
        "分析を保存しました。下の「分析履歴」からアクション追跡できます"
      );
    });
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-purple-50 to-white px-5 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI マーケティング分析
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {startMonth} 〜 {endMonth} のデータをもとに、メタ広告 / チラシの
              最適な配信範囲・年齢層・訴求仮説を Claude が提案します。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {generatedAt && (
              <span className="text-[11px] text-gray-400">
                最終分析:{" "}
                {new Date(generatedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </span>
            )}
            {/* 結果が出てたら「この分析を保存」ボタンを並べる。保存済なら
                done バッジに切替 (重複保存防止)。 */}
            {result && (
              <Button
                variant="outline"
                onClick={save}
                disabled={savePending || savedRunId != null}
              >
                {savePending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    保存中...
                  </>
                ) : savedRunId != null ? (
                  <>
                    <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" />
                    保存済み
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" />
                    この分析を保存
                  </>
                )}
              </Button>
            )}
            <Button onClick={run} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  {result ? "再分析する" : "分析を実行"}
                </>
              )}
            </Button>
          </div>
        </div>
        {error && (
          <div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-xs text-rose-800">
            <div className="font-bold">エラー</div>
            <div className="mt-0.5 break-all">{error}</div>
            <p className="mt-1 text-[11px] text-rose-600">
              ANTHROPIC_API_KEY が未設定の場合は、Vercel の環境変数に追加して
              再デプロイしてください。
            </p>
          </div>
        )}
      </Card>

      {!result && !pending && !error && (
        <Card className="p-6 text-center text-sm text-gray-500">
          まだ分析されていません。上の「分析を実行」を押してください。
        </Card>
      )}

      {result && (
        <>
          {/* サマリー */}
          <Card className="overflow-hidden">
            <div className="border-b bg-gray-50 px-5 py-2 text-xs font-bold text-gray-700">
              全体サマリー
            </div>
            <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {result.summary}
            </div>
          </Card>

          {/* メタ広告 */}
          <RecCard
            title="メタ広告 (Facebook / Instagram)"
            tone="bg-blue-50/40 border-blue-200"
            icon={<Megaphone className="h-4 w-4 text-blue-500" />}
            verdict={result.metaAds.verdict}
            radius={result.metaAds.recommendedRadiusKm}
            ageGroups={result.metaAds.recommendedAgeGroups}
            rationale={result.metaAds.rationale}
            actions={result.metaAds.actionItems}
          />

          {/* チラシ */}
          <RecCard
            title="チラシ"
            tone="bg-amber-50/40 border-amber-200"
            icon={<FileText className="h-4 w-4 text-amber-600" />}
            verdict={result.flyer.verdict}
            radius={result.flyer.recommendedRadiusKm}
            ageGroups={result.flyer.recommendedAgeGroups}
            rationale={result.flyer.rationale}
            actions={result.flyer.actionItems}
          />

          {/* クリエイティブ仮説 */}
          {result.creativeHypotheses.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-emerald-50/40 px-5 py-2 text-xs font-bold text-gray-700">
                <Lightbulb className="h-4 w-4 text-emerald-600" />
                クリエイティブ仮説
              </div>
              <ul className="divide-y divide-gray-100">
                {result.creativeHypotheses.map((h, i) => (
                  <li key={i} className="px-5 py-2 text-sm text-gray-800">
                    {h}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* 注意事項 */}
          {result.warnings.length > 0 && (
            <Card className="overflow-hidden border-amber-200">
              <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                データ解釈の注意点
              </div>
              <ul className="divide-y divide-amber-100">
                {result.warnings.map((w, i) => (
                  <li key={i} className="px-5 py-2 text-sm text-amber-900">
                    {w}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* 過去の保存分析 + アクション追跡。一覧と詳細をその場で展開できる */}
      <AnalysisHistoryPanel />
    </div>
  );
}

function RecCard({
  title,
  tone,
  icon,
  verdict,
  radius,
  ageGroups,
  rationale,
  actions,
}: {
  title: string;
  tone: string;
  icon: React.ReactNode;
  verdict: string;
  radius: number;
  ageGroups: string[];
  rationale: string;
  actions: string[];
}) {
  return (
    <Card className={`overflow-hidden border ${tone}`}>
      <div className="flex items-center gap-2 border-b bg-white/60 px-5 py-2 text-sm font-bold text-gray-800">
        {icon}
        {title}
      </div>
      <div className="space-y-3 p-4 text-sm text-gray-800">
        <div className="text-[13px] font-bold text-gray-900">{verdict}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-white p-3">
            <div className="text-[10px] font-bold text-gray-500">推奨半径</div>
            <div className="mt-1 text-2xl font-black text-gray-900">
              {radius}
              <span className="ml-1 text-sm font-medium">km</span>
            </div>
          </div>
          <div className="rounded-md border bg-white p-3">
            <div className="text-[10px] font-bold text-gray-500">推奨年齢層</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {ageGroups.length > 0 ? (
                ageGroups.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border bg-white px-2 py-0.5 text-xs font-bold text-gray-800"
                  >
                    {a}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">指定なし</span>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-500">根拠</div>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-gray-800">
            {rationale}
          </p>
        </div>
        {actions.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-gray-500">
              アクション
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
