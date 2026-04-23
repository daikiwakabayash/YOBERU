"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * リッチメニューからの遷移を裁くハブ。
 *
 * - `?menu=book` → /book/<DEFAULT_SLUG>
 * - `?menu=mypage` → /mypage (未実装ならトップ)
 * - `?menu=questionnaire&slug=<slug>` → /q/<slug>
 * - `?menu=history` → /mypage/history
 * - `?menu=coupon` → /coupon
 * - `?menu=contact` → LINE トークへ戻す (閉じる)
 *
 * NEXT_PUBLIC_LINE_LIFF_ID が設定されていれば LIFF SDK を CDN から読み
 * 込んで liff.init → userId を取得する。現段階では userId を使った
 * サーバサイド紐付けは行わず、URL 振り分けのみ実施 (v2 で拡張予定)。
 */

// Minimal ambient types for the LIFF SDK (we only use init + getProfile)
interface LiffApi {
  init: (opts: { liffId: string }) => Promise<void>;
  getProfile: () => Promise<{ userId: string; displayName: string }>;
}

export function LiffEntry() {
  const params = useSearchParams();
  const menu = params.get("menu") ?? "";
  const slug = params.get("slug") ?? "";
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  const route = useCallback(
    async (menuKey: string, questionnaireSlug: string) => {
      let href = "/";
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
          href = "/";
      }
      window.location.replace(href);
    },
    []
  );

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
    if (!liffId) {
      void route(menu, slug);
      return;
    }

    const existing = document.querySelector(
      'script[src*="static.line-scdn.net/liff"]'
    );
    const onReady = () => {
      const liff = (window as unknown as { liff?: LiffApi }).liff;
      if (!liff) {
        void route(menu, slug);
        return;
      }
      liff
        .init({ liffId })
        .then(async () => {
          try {
            const profile = await liff.getProfile();
            setLineUserId(profile.userId);
            void route(menu, slug);
          } catch {
            void route(menu, slug);
          }
        })
        .catch(() => void route(menu, slug));
    };

    if (existing) {
      onReady();
    } else {
      const script = document.createElement("script");
      script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      script.onload = onReady;
      script.onerror = () => void route(menu, slug);
      document.head.appendChild(script);
    }
  }, [menu, slug, route]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-center">
      <div>
        <p className="text-sm text-gray-600">ページを開いています...</p>
        {lineUserId && (
          <p className="mt-2 text-xs text-gray-400">
            連携 ID: {lineUserId.slice(0, 8)}...
          </p>
        )}
      </div>
    </div>
  );
}
