"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { sendLineReply } from "@/feature/line-chat/actions/lineChatActions";
import type { LineMessageRow } from "@/feature/line-chat/services/getLineMessages";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Props {
  shopId: number;
  customerId: number;
  lineUserId: string | null;
  hasAccessToken: boolean;
  messages: LineMessageRow[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function ChatThreadView({
  shopId,
  customerId,
  lineUserId,
  hasAccessToken,
  messages,
}: Props) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  const canSend = !!lineUserId && hasAccessToken;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !canSend) return;
    startTransition(async () => {
      const res = await sendLineReply({ shopId, customerId, text });
      if (res.success) {
        setText("");
        router.refresh();
      } else {
        toast.error(res.error ?? "送信に失敗しました");
      }
    });
  }

  // Group consecutive messages with the same date
  let lastDate = "";
  return (
    <>
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            まだメッセージがありません
          </p>
        ) : (
          messages.map((m) => {
            const d = formatDate(m.createdAt);
            const showDate = d !== lastDate;
            lastDate = d;
            const isOut = m.direction === "outbound";
            return (
              <div key={m.id}>
                {showDate && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-600">
                      {d}
                    </span>
                  </div>
                )}
                <div
                  className={`mb-2 flex ${isOut ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      isOut
                        ? "bg-green-500 text-white"
                        : "bg-white text-gray-900"
                    } ${m.messageType === "system" ? "italic opacity-70" : ""}`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {m.text ?? ""}
                    </p>
                    <p
                      className={`mt-1 text-[10px] ${isOut ? "text-green-100" : "text-gray-400"}`}
                    >
                      {formatTime(m.createdAt)}
                      {isOut && m.deliveryStatus === "failed" && (
                        <span className="ml-1 text-red-200">送信失敗</span>
                      )}
                      {isOut && m.source && m.source !== "chat_reply" && (
                        <span className="ml-1 opacity-80">({m.source})</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t bg-white px-4 py-3"
      >
        {!canSend && (
          <p className="mb-2 text-xs text-red-500">
            {!lineUserId
              ? "この顧客は LINE が未連携のため返信できません。"
              : "店舗の LINE Channel Access Token が設定されていません。店舗設定から登録してください。"}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={
              canSend ? "メッセージを入力 (Ctrl/⌘+Enter で送信)" : "送信不可"
            }
            disabled={!canSend || isPending}
            rows={2}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={!canSend || !text.trim() || isPending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-300"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </>
  );
}
