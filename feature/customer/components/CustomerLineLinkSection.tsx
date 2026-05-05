"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Send,
  Unlink,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  sendLineLinkInvite,
  unlinkLineUser,
} from "../actions/customerLineLinkActions";

interface Props {
  customerId: number;
  token: string;
  url: string;
  lineUserId: string | null;
  shopAddFriendUrl: string | null;
  appUrl: string;
}

/**
 * 顧客詳細ページに表示する LINE 紐付けカード。
 * - 顧客固有の URL + QR コードを表示
 * - 「LINE で送る」(既に line_user_id があればそれ宛にメッセージ)
 * - 「紐付け解除」(line_user_id を NULL に)
 */
export function CustomerLineLinkSection({
  customerId,
  token,
  url,
  lineUserId,
  shopAddFriendUrl,
  appUrl,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const linked = !!lineUserId;

  // QR は外部の汎用 API で生成 (ブラウザでも印刷でもそのまま動く)
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;

  function copy() {
    navigator.clipboard.writeText(url).then(
      () => toast.success("リンクをコピーしました"),
      () => toast.error("コピーに失敗しました")
    );
  }

  function send() {
    start(async () => {
      const res = await sendLineLinkInvite({ customerId, appUrl });
      if (res.error) toast.error(res.error, { duration: 8000 });
      else toast.success("LINE で送信しました");
    });
  }

  function unlink() {
    if (!confirm("この顧客の LINE 紐付けを解除します。よろしいですか？")) return;
    start(async () => {
      const res = await unlinkLineUser({ customerId });
      if (res.error) toast.error(res.error);
      else {
        toast.success("紐付けを解除しました");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">公式 LINE 紐付け</h3>
          {linked ? (
            <Badge className="bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              紐付け済み
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-50 text-amber-700">
              未紐付け
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-gray-500">
          下記のリンク (または QR コード) を顧客が踏むと、その LINE アカウントが
          このカルテと紐付き、LINE で予約確認 / キャンセル / リマインドを送れる
          ようになります。電話予約のお客様にも、この URL を LINE で送って踏んで
          もらってください。
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
          {/* QR */}
          <div className="flex flex-col items-center justify-center rounded border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="LINE 紐付け QR"
              width={220}
              height={220}
              className="h-44 w-44"
            />
            <span className="mt-1 text-[10px] text-gray-400">スマホで読取</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-gray-500">紐付け用 URL</div>
              <div className="break-all rounded border bg-gray-50 p-2 font-mono text-[11px]">
                {url}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">トークン</div>
              <div className="font-mono text-[10px] text-gray-400">{token}</div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy className="mr-1 h-3 w-3" />
                URL コピー
              </Button>
              {shopAddFriendUrl && (
                <a
                  href={shopAddFriendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    友だち追加 URL
                  </Button>
                </a>
              )}
              {linked && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={send}
                  >
                    <Send className="mr-1 h-3 w-3" />
                    LINE で再送信
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={unlink}
                    className="text-rose-600"
                  >
                    <Unlink className="mr-1 h-3 w-3" />
                    紐付け解除
                  </Button>
                </>
              )}
            </div>

            {linked && (
              <p className="text-[10px] text-emerald-700">
                LINE userId:{" "}
                <code className="rounded bg-emerald-50 px-1">{lineUserId}</code>
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
