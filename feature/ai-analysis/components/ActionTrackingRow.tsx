"use client";

import { useState, useTransition } from "react";
import { Check, CircleDashed, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import { updateAnalysisAction } from "../actions/aiAnalysisHistoryActions";

/**
 * 保存済みアクション 1 件分の進捗トラッキング UI。
 *
 * 列構成:
 *   - 左: 元のアクション原文 (AI が提案した文章)
 *   - 中: ステータス chip (pending / in_progress / done / skipped)
 *   - 右: 「実行内容」「結果」テキストエリア (展開式) + 評価★
 *
 * 楽観 UI で blur 時に updateAnalysisAction を呼ぶ。失敗時は元の値に
 * ロールバック。
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

export function ActionTrackingRow({
  actionId,
  actionText,
  initialStatus,
  initialWhatDone,
  initialOutcome,
  initialRating,
  executedAt,
  outcomeRecordedAt,
}: {
  actionId: number;
  actionText: string;
  initialStatus: Status;
  initialWhatDone: string | null;
  initialOutcome: string | null;
  initialRating: number | null;
  executedAt: string | null;
  outcomeRecordedAt: string | null;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [whatDone, setWhatDone] = useState(initialWhatDone ?? "");
  const [outcome, setOutcome] = useState(initialOutcome ?? "");
  const [rating, setRating] = useState<number | null>(initialRating);
  const [expanded, setExpanded] = useState(
    initialStatus !== "pending" ||
      !!initialWhatDone ||
      !!initialOutcome
  );
  const [pending, startTransition] = useTransition();

  function persist(fields: {
    status?: Status;
    whatDone?: string;
    outcome?: string;
    rating?: number | null;
  }) {
    startTransition(async () => {
      const r = await updateAnalysisAction({
        actionId,
        ...fields,
      });
      if (!r.ok) toast.error(r.error);
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
        </div>
      )}
    </div>
  );
}
