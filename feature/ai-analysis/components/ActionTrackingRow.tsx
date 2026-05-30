"use client";

import { useState, useTransition } from "react";
import { Check, CircleDashed, PlayCircle, X, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  updateAnalysisAction,
  evaluateActionOutcome,
  type OutcomeMetrics,
  type BookingLinkOption,
} from "../actions/aiAnalysisHistoryActions";

/**
 * 保存済みアクション 1 件分の進捗トラッキング UI。
 *
 * 列構成:
 *   - 左: 元のアクション原文 (AI が提案した文章)
 *   - 中: ステータス chip (pending / in_progress / done / skipped)
 *   - 右: 「実行内容」「結果」テキストエリア (展開式) + 評価★
 *
 * 加えて Phase 1 (migration 00055): そのアクションがどの強制リンク
 * (= クリエイティブ) に対応するかを紐付け、観測期間の CPA / 入会率 /
 * キャンセル率 / ROAS を クリエイティブ分析から自動スナップショットできる。
 *
 * 楽観 UI で blur 時に updateAnalysisAction を呼ぶ。失敗時はトーストで通知。
 */
type Status = "pending" | "in_progress" | "done" | "skipped";

const STATUS_META: Record<
  Status,
  { label: string; color: string; icon: React.ReactNode }
> = {
  pending: {
    label: "未着手",
    color: "bg-gray-100 text-gray-600 border-gray-300",
    icon: <CircleDashed className="h-3.5 w-3.5" />,
  },
  in_progress: {
    label: "実行中",
    color: "bg-blue-100 text-blue-700 border-blue-300",
    icon: <PlayCircle className="h-3.5 w-3.5" />,
  },
  done: {
    label: "完了",
    color: "bg-emerald-100 text-emerald-700 border-emerald-300",
    icon: <Check className="h-3.5 w-3.5" />,
  },
  skipped: {
    label: "見送り",
    color: "bg-amber-100 text-amber-700 border-amber-300",
    icon: <X className="h-3.5 w-3.5" />,
  },
};

function yen(n: number): string {
  return `¥${Math.round(n || 0).toLocaleString()}`;
}
function pct(r: number): string {
  return `${Math.round((r || 0) * 100)}%`;
}

export function ActionTrackingRow({
  actionId,
  actionText,
  initialStatus,
  initialWhatDone,
  initialOutcome,
  initialRating,
  executedAt,
  outcomeRecordedAt,
  bookingLinks,
  initialBookingLinkId,
  initialObservedStartMonth,
  initialObservedEndMonth,
  initialOutcomeMetrics,
  outcomeEvaluatedAt,
  runStartMonth,
  runEndMonth,
}: {
  actionId: number;
  actionText: string;
  initialStatus: Status;
  initialWhatDone: string | null;
  initialOutcome: string | null;
  initialRating: number | null;
  executedAt: string | null;
  outcomeRecordedAt: string | null;
  bookingLinks: BookingLinkOption[];
  initialBookingLinkId: number | null;
  initialObservedStartMonth: string | null;
  initialObservedEndMonth: string | null;
  initialOutcomeMetrics: OutcomeMetrics | null;
  outcomeEvaluatedAt: string | null;
  runStartMonth: string;
  runEndMonth: string;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [whatDone, setWhatDone] = useState(initialWhatDone ?? "");
  const [outcome, setOutcome] = useState(initialOutcome ?? "");
  const [rating, setRating] = useState<number | null>(initialRating);
  const [expanded, setExpanded] = useState(
    initialStatus !== "pending" ||
      !!initialWhatDone ||
      !!initialOutcome ||
      initialBookingLinkId != null
  );
  const [pending, startTransition] = useTransition();

  // 成果測定 state
  const [bookingLinkId, setBookingLinkId] = useState<number | null>(
    initialBookingLinkId
  );
  const [observedStart, setObservedStart] = useState(
    initialObservedStartMonth ?? runStartMonth
  );
  const [observedEnd, setObservedEnd] = useState(
    initialObservedEndMonth ?? runEndMonth
  );
  const [metrics, setMetrics] = useState<OutcomeMetrics | null>(
    initialOutcomeMetrics
  );
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(
    outcomeEvaluatedAt
  );
  const [evaluating, setEvaluating] = useState(false);

  function persist(fields: {
    status?: Status;
    whatDone?: string;
    outcome?: string;
    rating?: number | null;
    bookingLinkId?: number | null;
    observedStartMonth?: string;
    observedEndMonth?: string;
  }) {
    startTransition(async () => {
      const r = await updateAnalysisAction({
        actionId,
        ...fields,
      });
      if (!r.ok) toast.error(r.error);
    });
  }

  function runEvaluation() {
    if (bookingLinkId == null) {
      toast.error("先に成果測定の対象となる強制リンクを選択してください。");
      return;
    }
    setEvaluating(true);
    startTransition(async () => {
      const r = await evaluateActionOutcome({ actionId });
      setEvaluating(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setMetrics(r.metrics);
      setEvaluatedAt(new Date().toISOString());
      toast.success("成果を取得しました");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-start gap-2">
        <p className="flex-1 text-sm text-gray-800 leading-relaxed">
          {actionText}
        </p>
        <select
          value={status}
          disabled={pending}
          onChange={(e) => {
            const nv = e.target.value as Status;
            setStatus(nv);
            if (nv !== "pending" || !!whatDone || !!outcome) setExpanded(true);
            persist({ status: nv });
          }}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
            STATUS_META[status].color
          }`}
        >
          {(Object.keys(STATUS_META) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] font-medium text-blue-600 hover:underline"
        >
          {expanded ? "閉じる" : "記録する"}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t pt-2">
          <div>
            <label className="text-[10px] font-bold text-gray-500">
              実際にやったこと
            </label>
            <textarea
              value={whatDone}
              onChange={(e) => setWhatDone(e.target.value)}
              onBlur={() => persist({ whatDone })}
              disabled={pending}
              rows={2}
              placeholder="例: Meta 広告マネージャーで地域ターゲティングを 5km → 3km に変更"
              className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
            />
            {executedAt && status === "done" && (
              <p className="mt-0.5 text-[10px] text-gray-400">
                完了:{" "}
                {new Date(executedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500">
              結果 / 経過
            </label>
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              onBlur={() => persist({ outcome })}
              disabled={pending}
              rows={2}
              placeholder="例: CTR は 1.2% → 1.5% に改善。CPA は ¥6,800 → ¥5,200。"
              className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
            />
            {outcomeRecordedAt && (
              <p className="mt-0.5 text-[10px] text-gray-400">
                記録:{" "}
                {new Date(outcomeRecordedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-gray-500">評価</span>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const nv = rating === v ? null : v;
                  setRating(nv);
                  persist({ rating: nv });
                }}
                disabled={pending}
                className={`text-base ${
                  rating != null && rating >= v
                    ? "text-amber-500"
                    : "text-gray-300 hover:text-amber-300"
                }`}
                aria-label={`${v} 星`}
              >
                ★
              </button>
            ))}
            {rating != null && (
              <button
                type="button"
                onClick={() => {
                  setRating(null);
                  persist({ rating: null });
                }}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                クリア
              </button>
            )}
          </div>

          {/* 成果測定 (クリエイティブ分析から自動スナップショット) */}
          <div className="space-y-2 rounded-md border border-fuchsia-100 bg-fuchsia-50/40 p-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-fuchsia-700">
              <BarChart3 className="h-3.5 w-3.5" />
              成果測定 (強制リンクの実データから自動計算)
            </div>
            {bookingLinks.length === 0 ? (
              <p className="text-[10px] text-gray-500">
                この店舗に強制リンクがありません。先に「強制リンク」を作成すると、
                クリエイティブの CPA / 入会率を自動測定できます。
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[180px] flex-1">
                    <label className="text-[10px] font-bold text-gray-500">
                      対象の強制リンク (クリエイティブ)
                    </label>
                    <select
                      value={bookingLinkId ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        const nv = e.target.value
                          ? Number(e.target.value)
                          : null;
                        setBookingLinkId(nv);
                        persist({ bookingLinkId: nv });
                      }}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                    >
                      <option value="">選択しない</option>
                      {bookingLinks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                          {b.offerPrice != null
                            ? ` / ¥${b.offerPrice.toLocaleString()}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500">
                      観測期間
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="month"
                        value={observedStart}
                        disabled={pending}
                        onChange={(e) => setObservedStart(e.target.value)}
                        onBlur={() =>
                          persist({ observedStartMonth: observedStart })
                        }
                        className="rounded-md border px-1.5 py-1 text-xs"
                      />
                      <span className="text-[10px] text-gray-400">〜</span>
                      <input
                        type="month"
                        value={observedEnd}
                        disabled={pending}
                        onChange={(e) => setObservedEnd(e.target.value)}
                        onBlur={() =>
                          persist({ observedEndMonth: observedEnd })
                        }
                        className="rounded-md border px-1.5 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={runEvaluation}
                    disabled={pending || evaluating || bookingLinkId == null}
                    className="flex items-center gap-1 rounded-md bg-fuchsia-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-fuchsia-700 disabled:opacity-50"
                  >
                    {evaluating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BarChart3 className="h-3.5 w-3.5" />
                    )}
                    成果を取得
                  </button>
                </div>

                {metrics && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                      <Metric label="実来院" value={`${metrics.visitCount}`} />
                      <Metric label="入会数" value={`${metrics.joinCount}`} />
                      <Metric
                        label="入会率"
                        value={pct(metrics.joinRate)}
                        tone="text-blue-600"
                      />
                      <Metric
                        label="キャンセル率"
                        value={pct(metrics.cancelRate)}
                        tone="text-rose-600"
                      />
                      <Metric
                        label="CPA"
                        value={metrics.cpa > 0 ? yen(metrics.cpa) : "-"}
                      />
                      <Metric
                        label="ROAS"
                        value={
                          metrics.adSpend > 0 ? metrics.roas.toFixed(2) : "-"
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-gray-500">
                      <span>広告費 {yen(metrics.adSpend)}</span>
                      <span>売上 {yen(metrics.sales)}</span>
                      <span>
                        観測 {metrics.observedStartMonth}
                        {metrics.observedStartMonth !== metrics.observedEndMonth
                          ? ` 〜 ${metrics.observedEndMonth}`
                          : ""}
                      </span>
                      {evaluatedAt && (
                        <span>
                          取得:{" "}
                          {new Date(evaluatedAt).toLocaleString("ja-JP", {
                            timeZone: "Asia/Tokyo",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border bg-white px-2 py-1 text-center">
      <div className="text-[9px] font-medium text-gray-400">{label}</div>
      <div className={`text-xs font-bold ${tone ?? "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}
