"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, ChevronRight, Megaphone, FileText, Lightbulb, Loader2 } from "lucide-react";
import {
  listAnalysisRuns,
  getAnalysisRunDetail,
  type AnalysisRunSummary,
  type AnalysisRunDetail,
} from "../actions/aiAnalysisHistoryActions";
import { ActionTrackingRow } from "./ActionTrackingRow";

/**
 * 過去の AI 分析履歴 + 各 run のアクション追跡を見るパネル。
 *
 * UX:
 *  - 「履歴を見る」リンクで一覧表示 (折り畳み式)
 *  - 一覧の各 run はカード化。実行月 / 作成日時 / 進捗率 を表示。
 *  - カードクリック → 詳細にトグル展開、アクション 1 件ずつ
 *    ActionTrackingRow で進捗入力可能。
 */
export function AnalysisHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<AnalysisRunSummary[] | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AnalysisRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || runs !== null) return;
    startTransition(async () => {
      const list = await listAnalysisRuns();
      setRuns(list);
    });
  }, [open, runs]);

  async function toggleDetail(runId: number) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setDetail(null);
      return;
    }
    setExpandedRunId(runId);
    setLoadingDetail(true);
    const d = await getAnalysisRunDetail(runId);
    setDetail(d);
    setLoadingDetail(false);
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b bg-gradient-to-r from-gray-50 to-white px-5 py-3 text-left text-sm font-bold text-gray-800 hover:bg-gray-100"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4 text-gray-500" />
          分析履歴 / アクション追跡
          {runs && runs.length > 0 && (
            <span className="rounded bg-gray-200 px-1.5 text-[10px] font-bold text-gray-700">
              {runs.length}
            </span>
          )}
        </span>
        <ChevronRight
          className={`h-4 w-4 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="space-y-2 p-3">
          {pending && runs === null ? (
            <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中...
            </div>
          ) : runs && runs.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-500">
              まだ保存された分析がありません。
              <br />
              「分析を実行」した後に「この分析結果を保存」を押すと履歴に
              残ります。
            </p>
          ) : (
            runs?.map((r) => (
              <RunCard
                key={r.id}
                run={r}
                expanded={expandedRunId === r.id}
                detail={expandedRunId === r.id ? detail : null}
                loadingDetail={loadingDetail && expandedRunId === r.id}
                onToggle={() => toggleDetail(r.id)}
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function RunCard({
  run,
  expanded,
  detail,
  loadingDetail,
  onToggle,
}: {
  run: AnalysisRunSummary;
  expanded: boolean;
  detail: AnalysisRunDetail | null;
  loadingDetail: boolean;
  onToggle: () => void;
}) {
  const progressPct =
    run.totalActions > 0
      ? Math.round((run.doneActions / run.totalActions) * 100)
      : 0;
  const createdAt = new Date(run.createdAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
  const period =
    run.startMonth === run.endMonth
      ? run.startMonth
      : `${run.startMonth} 〜 ${run.endMonth}`;

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
            {period}
            <span className="text-[10px] font-normal text-gray-400">
              {createdAt}
            </span>
          </div>
          {run.summary && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
              {run.summary}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">
            完了 {run.doneActions}/{run.totalActions} ({progressPct}%)
          </span>
          <ChevronRight
            className={`h-4 w-4 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t bg-gray-50/40 p-3">
          {loadingDetail || !detail ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              詳細を読み込み中...
            </div>
          ) : (
            <>
              {detail.summary && (
                <p className="rounded border bg-white p-2 text-xs text-gray-700 whitespace-pre-wrap">
                  {detail.summary}
                </p>
              )}
              <ActionSection
                title="メタ広告"
                icon={<Megaphone className="h-3.5 w-3.5 text-blue-500" />}
                actions={detail.actions.filter(
                  (a) => a.section === "meta_ads"
                )}
              />
              <ActionSection
                title="チラシ"
                icon={<FileText className="h-3.5 w-3.5 text-amber-600" />}
                actions={detail.actions.filter(
                  (a) => a.section === "flyer"
                )}
              />
              <ActionSection
                title="クリエイティブ仮説"
                icon={
                  <Lightbulb className="h-3.5 w-3.5 text-emerald-600" />
                }
                actions={detail.actions.filter(
                  (a) => a.section === "creative_hypothesis"
                )}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionSection({
  title,
  icon,
  actions,
}: {
  title: string;
  icon: React.ReactNode;
  actions: AnalysisRunDetail["actions"];
}) {
  if (actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
        {icon}
        {title}
        <span className="text-[10px] font-normal text-gray-400">
          ({actions.filter((a) => a.status === "done").length} / {actions.length} 完了)
        </span>
      </div>
      <div className="space-y-1.5">
        {actions.map((a) => (
          <ActionTrackingRow
            key={a.id}
            actionId={a.id}
            actionText={a.actionText}
            initialStatus={a.status}
            initialWhatDone={a.whatDone}
            initialOutcome={a.outcome}
            initialRating={a.rating}
            executedAt={a.executedAt}
            outcomeRecordedAt={a.outcomeRecordedAt}
          />
        ))}
      </div>
    </div>
  );
}

// React の Button を流用しないのは、ここはトグルだけのインライン UI なので
// 軽量化のため。将来 button.tsx で揃えたくなったら入れ替える。
export const __keepImport = Button;
