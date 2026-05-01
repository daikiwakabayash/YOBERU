"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { linkLineUserToCustomer } from "../actions/linkLineUser";

interface LiffApi {
  init: (opts: { liffId: string }) => Promise<void>;
  getProfile: () => Promise<{ userId: string; displayName: string }>;
  isInClient?: () => boolean;
}

interface Props {
  token: string;
  /** 紐付け済みの場合の line_user_id (UI のヒント用) */
  preLinkedUserId: string | null;
  shopAddFriendUrl: string | null;
}

type State =
  | { kind: "loading" }
  | { kind: "no-liff"; reason: string }
  | { kind: "linking" }
  | { kind: "linked"; customerId: number }
  | { kind: "error"; message: string };

/**
 * 顧客固有の LINE 紐付けランディング。
 * 1. LIFF SDK 初期化
 * 2. liff.getProfile() で userId 取得
 * 3. server action で customer.line_user_id を更新
 * 4. /mypage へ遷移
 */
export function LineLinkClient({
  token,
  preLinkedUserId,
  shopAddFriendUrl,
}: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
    if (!liffId) {
      setState({
        kind: "no-liff",
        reason:
          "LIFF が設定されていません (NEXT_PUBLIC_LINE_LIFF_ID 未設定)。",
      });
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    tag.async = true;
    tag.onload = init;
    tag.onerror = () =>
      setState({
        kind: "no-liff",
        reason: "LIFF SDK の読込に失敗しました",
      });
    document.body.appendChild(tag);

    async function init() {
      const liff = (window as unknown as { liff?: LiffApi }).liff;
      if (!liff) {
        setState({
          kind: "no-liff",
          reason: "LIFF SDK が利用できません",
        });
        return;
      }
      try {
        await liff.init({ liffId: liffId! });
        const profile = await liff.getProfile();
        setState({ kind: "linking" });
        const res = await linkLineUserToCustomer({
          token,
          lineUserId: profile.userId,
          displayName: profile.displayName,
        });
        if (res.error) {
          setState({ kind: "error", message: res.error });
          return;
        }
        setState({
          kind: "linked",
          customerId: res.customerId ?? 0,
        });
        // 1.2 秒後に /mypage へ自動遷移
        setTimeout(() => {
          window.location.replace("/mypage");
        }, 1200);
      } catch (e) {
        setState({
          kind: "error",
          message:
            e instanceof Error ? e.message : "予期しないエラーが発生しました",
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-md p-4">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h1 className="text-base font-bold">公式 LINE と紐付け中</h1>

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中...
            </div>
          )}

          {state.kind === "linking" && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              LINE と紐付け中...
            </div>
          )}

          {state.kind === "linked" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-bold">紐付けが完了しました</span>
              </div>
              <p className="text-xs text-gray-600">
                マイページへ移動します...
              </p>
            </div>
          )}

          {state.kind === "no-liff" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  このページは LINE アプリ内で開いてください。
                </span>
              </div>
              <p className="text-[11px] text-gray-500">{state.reason}</p>
              {preLinkedUserId && (
                <p className="text-[11px] text-emerald-700">
                  ※ このリンクは既に紐付け済みです (LINE userId:{" "}
                  <code className="rounded bg-emerald-50 px-1">
                    {preLinkedUserId.slice(0, 8)}…
                  </code>
                  )
                </p>
              )}
              {shopAddFriendUrl && (
                <a
                  href={shopAddFriendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button size="sm" variant="outline" className="w-full">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    まず公式 LINE を友だち追加
                  </Button>
                </a>
              )}
            </div>
          )}

          {state.kind === "error" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span className="font-bold">エラーが発生しました</span>
              </div>
              <p className="text-[11px] break-all text-gray-600">
                {state.message}
              </p>
              <p className="text-[11px] text-gray-500">
                店舗までお問い合わせください。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
