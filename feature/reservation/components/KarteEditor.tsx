"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { updateAppointmentKarte } from "../actions/karteActions";

interface KarteEditorProps {
  appointmentId: number;
  initialText: string | null;
  /** ISO timestamp of last edit, or null if never edited */
  updatedAt: string | null;
  /** Email of last editor, or null */
  updatedBy: string | null;
}

/**
 * 日ごとのカルテ本文をインラインで後から編集する UI。
 *
 * 既定は「閲覧モード」で本文をプレーンテキスト表示、右下に
 * 「最終更新: YYYY-MM-DD HH:MM by email」を小さく出す。編集ボタン
 * を押すと textarea に切り替わり、保存ボタンで server action を呼ぶ。
 *
 * 編集者情報は Supabase Auth のログインメアドを server 側で取得して
 * DB に記録する。認証無しで叩いた場合 (テスト環境等) は by が null。
 */
export function KarteEditor({
  appointmentId,
  initialText,
  updatedAt,
  updatedBy,
}: KarteEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(initialText ?? "");

  async function handleSave() {
    startTransition(async () => {
      const res = await updateAppointmentKarte(appointmentId, text);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("カルテを更新しました");
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setText(initialText ?? "");
    setEditing(false);
  }

  const displayText = initialText ?? "";
  const meta = formatAuditLine(updatedAt, updatedBy);

  if (editing) {
    return (
      <div className="mt-3 rounded bg-gray-50 p-3">
        <div className="mb-2 text-xs font-medium text-gray-400">カルテ</div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="bg-white text-sm"
          autoFocus
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={pending}
          >
            <X className="mr-1 h-3 w-3" />
            キャンセル
          </Button>
          <Button size="sm" onClick={handleSave} disabled={pending}>
            <Check className="mr-1 h-3 w-3" />
            {pending ? "保存中..." : "保存する"}
          </Button>
        </div>
      </div>
    );
  }

  // 閲覧モード
  return (
    <div className="mt-3 rounded bg-gray-50 p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">カルテ</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
        >
          <Pencil className="h-3 w-3" />
          編集
        </button>
      </div>
      {displayText ? (
        <p className="whitespace-pre-wrap text-gray-700">{displayText}</p>
      ) : (
        <p className="text-xs italic text-gray-400">
          カルテ未記入 — 「編集」から追記できます
        </p>
      )}
      {meta && (
        <div className="mt-2 text-right text-[10px] text-gray-400">
          {meta}
        </div>
      )}
    </div>
  );
}

function formatAuditLine(
  updatedAt: string | null,
  updatedBy: string | null
): string | null {
  if (!updatedAt) return null;
  // ISO UTC → JST 表示 (YYYY-MM-DD HH:MM)
  const d = new Date(updatedAt);
  if (isNaN(d.getTime())) return null;
  const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const j = new Date(jstMs);
  const y = j.getUTCFullYear();
  const mo = String(j.getUTCMonth() + 1).padStart(2, "0");
  const da = String(j.getUTCDate()).padStart(2, "0");
  const hh = String(j.getUTCHours()).padStart(2, "0");
  const mm = String(j.getUTCMinutes()).padStart(2, "0");
  const when = `${y}-${mo}-${da} ${hh}:${mm}`;
  return updatedBy
    ? `最終更新: ${when} by ${updatedBy}`
    : `最終更新: ${when}`;
}
