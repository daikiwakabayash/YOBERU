"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { linkLineUserToCustomer } from "../actions/linkLineUser";

interface LiffApi {
  init: (opts: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (opts?: { redirectUri?: string }) => void;
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
  | { kind: "redirecting-login" }
  | { kind: "no-liff"; reason: string }
  | { kind: "linking" }
  | { kind: "linked"; customerId: number }
  | {
      kind: "confirm";
      profile: { userId: string; displayName: string };
      reason: "customer_has_other_line" | "line_taken_by_other_customer";
      maskedExistingName: string;
      message: string;
    }
  | { kind: "error"; message: string };

/**
 * 顧客固有の LINE 紐付けランディング。
 *
 * フロー:
 *   1. LIFF SDK 初期化
 *   2. liff.isLoggedIn() でログイン状態を確認
 *      - 未ログイン (PC ブラウザ / 普通のスマホブラウザから開いた場合)
 *        → liff.login() で LINE OAuth へリダイレクト。完了後 同じ URL に
 *          戻ってくるので、再実行で 2 周目に入って紐付けが進む。
 *      - ログイン済 (LINE アプリ内で開いた場合 = 自動的に true)
 *        → そのまま 3. へ
 *   3. liff.getProfile() で userId 取得
 *   4. server action で customer.line_user_id を更新
 *      - 既存紐付けと衝突する場合は requiresConfirmation を返すので、
 *        顧客に確認 UI を表示し、承諾後に force=true で再実行
 *   5. /mypage へ遷移
 */
export function LineLinkClient({
  token,
  preLinkedUserId,
  shopAddFriendUrl,
}: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  async function attemptLink(
    profile: { userId: string; displayName: string },
    force: boolean
  ): Promise<void> {
    const res = await linkLineUserToCustomer({
      token,
      lineUserId: profile.userId,
      displayName: profile.displayName,
      force,
    });

    if (res.success) {
      setState({ kind: "linked", customerId: res.customerId ?? 0 });
      setTimeout(() => {
        window.location.replace("/mypage");
      }, 1200);
      return;
    }

    if (res.requiresConfirmation) {
      setState({
        kind: "confirm",
        profile,
        reason: res.requiresConfirmation.reason,
        maskedExistingName: res.requiresConfirmation.maskedExistingName,
        message: res.error ?? "確認が必要です",
      });
      return;
    }

    setState({
      kind: "error",
      message: res.error ?? "予期しないエラーが発生しました",
    });
  }

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

        // PC ブラウザや LINE 外スマホブラウザで開かれた場合は未ログイン状態。
        // liff.login() を呼ぶと LINE OAuth ページに飛び、認可後に同 URL に
        // 戻ってきて isLoggedIn() が true になる (= 2 周目の useEffect で
        // getProfile に進める)。
        if (!liff.isLoggedIn()) {
          setState({ kind: "redirecting-login" });
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const profile = await liff.getProfile();
        setState({ kind: "linking" });
        await attemptLink(profile, false);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        // よくある LIFF エラーの日本語化
        let msg = raw;
        if (raw.includes("access_token")) {
          msg =
            "LINE ログインが完了していません。ページを再読込してもう一度お試しください。";
        } else if (raw.toLowerCase().includes("liff id")) {
          msg =
            "LIFF ID の設定に問題があります。店舗までお問い合わせください。";
        }
        setState({ kind: "error", message: msg });
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

          {state.kind === "redirecting-login" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                LINE ログイン画面へ移動します...
              </div>
              <p className="text-[11px] text-gray-500">
                自動で遷移しない場合はページを再読込してください。
              </p>
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

          {state.kind === "confirm" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    既存の紐付けが見つかりました
                  </p>
                  <p className="text-xs">{state.message}</p>
                  {state.reason === "line_taken_by_other_customer" && (
                    <p className="text-xs">
                      現在の紐付け先:{" "}
                      <span className="font-mono">
                        {state.maskedExistingName}
                      </span>
                    </p>
                  )}
                  {state.reason === "customer_has_other_line" && (
                    <p className="text-xs">
                      このカルテ ({state.maskedExistingName}) 宛のリマインドは
                      現在、別の LINE に送られています。
                      切り替えると、その紐付けは解除されます。
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Button
                  className="w-full bg-rose-600 hover:bg-rose-700"
                  onClick={() => {
                    setState({ kind: "linking" });
                    attemptLink(state.profile, true);
                  }}
                >
                  上書きしてこの LINE と紐付ける
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setState({
                      kind: "error",
                      message:
                        "紐付けをキャンセルしました。お困りの場合は店舗へお問い合わせください。",
                    })
                  }
                >
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          {state.kind === "no-liff" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>このページは LINE アプリ内で開いてください。</span>
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
