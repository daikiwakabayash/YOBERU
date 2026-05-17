"use client";

import { useEffect, useState } from "react";

interface LiffApi {
  init: (opts: { liffId: string }) => Promise<void>;
}

/**
 * LIFF 中継専用クライアント。liff.init() だけを呼ぶ。
 *
 * LINE 認証後、LINE はブラウザを Endpoint URL (= このページ /line/link)
 * に `?liff.state=/<token>` 付きで戻す。liff.init() がその liff.state を
 * 検出し、自動的に元の redirectUri (/line/link/<token>) へ遷移させる。
 * よってここでは描画とエラー表示以外、明示的な画面遷移を一切行わない。
 *
 * 特に `/` へのフォールバックはしない: 未ログイン顧客は middleware で
 * スタッフ用 `/login` に飛ばされ、予約客に管理画面ログインを見せて
 * しまうため (helper/lib/supabase/middleware.ts)。
 */
export function LiffRelay() {
  // NEXT_PUBLIC_ なのでビルド時インライン。描画時に純粋評価できるため
  // liffId 未設定のエラーは effect ではなく lazy initializer で確定する
  // (effect 内同期 setState を避ける)。
  const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
  const [error, setError] = useState<string | null>(
    liffId
      ? null
      : "LINE 連携の設定が見つかりません。お手数ですが店舗へお問い合わせください。"
  );

  useEffect(() => {
    if (!liffId) return;

    let cancelled = false;
    const fail = (msg: string) => {
      if (!cancelled) setError(msg);
    };

    const onReady = () => {
      const liff = (window as unknown as { liff?: LiffApi }).liff;
      if (!liff) {
        fail(
          "LINE の読み込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください。"
        );
        return;
      }
      liff.init({ liffId }).catch(() => {
        fail(
          "LINE 連携の読み込みに失敗しました。LINE アプリから開き直してください。"
        );
      });
    };

    const existing = document.querySelector(
      'script[src*="static.line-scdn.net/liff"]'
    );
    if (existing) {
      // 既存スクリプトがあっても effect 同期実行を避けてマイクロタスクで。
      queueMicrotask(onReady);
      return () => {
        cancelled = true;
      };
    }
    const tag = document.createElement("script");
    tag.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    tag.async = true;
    tag.onload = onReady;
    tag.onerror = () =>
      fail(
        "LINE の読み込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください。"
      );
    document.body.appendChild(tag);

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-6 text-center">
      <div className="space-y-2">
        {error ? (
          <>
            <p className="text-sm font-bold text-rose-700">
              読み込みできませんでした
            </p>
            <p className="text-xs break-all text-gray-600">{error}</p>
          </>
        ) : (
          <p className="text-sm text-gray-600">読み込み中...</p>
        )}
      </div>
    </div>
  );
}
