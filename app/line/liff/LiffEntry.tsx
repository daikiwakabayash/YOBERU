"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { linkCustomerByLiffToken } from "@/feature/line-chat/actions/linkCustomerActions";

/**
 * リッチメニュー / 予約完了画面からの遷移を裁くハブ。
 *
 * モード:
 *   - `?action=link&token=<signed>` : 予約完了画面からの LINE 連携。
 *       LIFF SDK で userId を取得 → server action で customers.line_user_id
 *       を確定。完了後は menu= の指定があればそこへ。なければ LINE トーク
 *       に戻れるよう案内する。
 *   - `?menu=book` → /book/<DEFAULT_SLUG>
 *   - `?menu=mypage` → /mypage
 *   - `?menu=questionnaire&slug=<slug>` → /q/<slug>
 *   - `?menu=history` → /mypage/history
 *   - `?menu=coupon` → /coupon
 *
 * NEXT_PUBLIC_LINE_LIFF_ID が必要。未設定なら link は失敗扱い、menu は
 * SDK 抜きで遷移のみ実行。
 */

interface LiffApi {
  init: (opts: { liffId: string }) => Promise<void>;
  getProfile: () => Promise<{ userId: string; displayName: string }>;
  isInClient?: () => boolean;
  closeWindow?: () => void;
}

type LinkState = "idle" | "linking" | "success" | "failed";

export function LiffEntry() {
  const params = useSearchParams();
  const menu = params.get("menu") ?? "";
  const slug = params.get("slug") ?? "";
  const action = params.get("action") ?? "";
  const token = params.get("token") ?? "";

  const [linkState, setLinkState] = useState<LinkState>("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
  const ranRef = useRef(false);

  const route = useCallback(
    (menuKey: string, questionnaireSlug: string) => {
      let href: string | null = null;
      switch (menuKey) {
        case "book":
          href = process.env.NEXT_PUBLIC_DEFAULT_BOOK_SLUG
            ? `/book/${process.env.NEXT_PUBLIC_DEFAULT_BOOK_SLUG}`
            : "/";
          break;
        case "questionnaire":
          href = questionnaireSlug ? `/q/${questionnaireSlug}` : "/";
          break;
        case "mypage":
          href = "/mypage";
          break;
        case "history":
          href = "/mypage/history";
          break;
        case "coupon":
          href = "/coupon";
          break;
        default:
          href = null;
      }
      if (href) window.location.replace(href);
    },
    []
  );

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;

    // SDK ロード前にエラーで終わるケースは microtask に逃がして、effect
    // 本体で同期的に setState しないようにする (react-hooks lint 対応)。
    const fail = (msg: string) => {
      queueMicrotask(() => {
        setLinkState("failed");
        setLinkError(msg);
      });
    };

    // link モード: SDK 必須。SDK 抜きでは customer 紐付けは不可能。
    if (action === "link") {
      if (!liffId) {
        fail("LIFF ID が未設定です。管理者にご連絡ください。");
        return;
      }
      if (!token) {
        fail("リンクが不正です (token が見つかりません)。");
        return;
      }
    } else if (!liffId) {
      // menu のみのモードは SDK 不要、即遷移
      route(menu, slug);
      return;
    }

    const onReady = () => {
      const liff = (window as unknown as { liff?: LiffApi }).liff;
      if (!liff) {
        if (action === "link") {
          setLinkState("failed");
          setLinkError("LIFF SDK の読み込みに失敗しました");
        } else {
          route(menu, slug);
        }
        return;
      }
      liff
        .init({ liffId: liffId! })
        .then(async () => {
          if (action === "link") {
            setLinkState("linking");
            try {
              const profile = await liff.getProfile();
              const result = await linkCustomerByLiffToken({
                token,
                lineUserId: profile.userId,
              });
              if (result.success) {
                setLinkState("success");
                // 連携完了したら menu= の指定があればそちらへ。なければ
                // 自動で LINE トークへ戻すかメッセージを表示するだけ。
                if (menu) {
                  setTimeout(() => route(menu, slug), 1500);
                } else if (liff.isInClient?.() && liff.closeWindow) {
                  setTimeout(() => liff.closeWindow!(), 1500);
                }
              } else {
                setLinkState("failed");
                setLinkError(result.error ?? "連携に失敗しました");
              }
            } catch (e) {
              setLinkState("failed");
              setLinkError(
                e instanceof Error ? e.message : "プロフィール取得に失敗しました"
              );
            }
          } else {
            // menu 振り分けのみ
            route(menu, slug);
          }
        })
        .catch((e) => {
          if (action === "link") {
            setLinkState("failed");
            setLinkError(
              e instanceof Error ? e.message : "LIFF 初期化に失敗しました"
            );
          } else {
            route(menu, slug);
          }
        });
    };

    const existing = document.querySelector(
      'script[src*="static.line-scdn.net/liff"]'
    );
    if (existing) {
      onReady();
    } else {
      const script = document.createElement("script");
      script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      script.onload = onReady;
      script.onerror = () => {
        if (action === "link") {
          setLinkState("failed");
          setLinkError("LIFF SDK の読み込みに失敗しました");
        } else {
          route(menu, slug);
        }
      };
      document.head.appendChild(script);
    }
  }, [action, token, menu, slug, route]);

  if (action === "link") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-100">
          {linkState === "idle" || linkState === "linking" ? (
            <>
              <p className="text-sm font-medium text-gray-700">
                LINE と予約情報を連携しています...
              </p>
              <p className="mt-2 text-xs text-gray-400">
                少々お待ちください
              </p>
            </>
          ) : linkState === "success" ? (
            <>
              <p className="text-base font-bold text-emerald-600">
                ✓ 連携が完了しました
              </p>
              <p className="mt-2 text-sm text-gray-600">
                予約のリマインドを LINE でお届けします。
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-red-600">
                連携に失敗しました
              </p>
              <p className="mt-2 text-xs text-gray-600">
                {linkError ?? "もう一度お試しください"}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-center">
      <p className="text-sm text-gray-600">ページを開いています...</p>
    </div>
  );
}
