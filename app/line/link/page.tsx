import { Suspense } from "react";
import { LiffRelay } from "./LiffRelay";

export const metadata = {
  title: "LINE 連携",
};

/**
 * `/line/link` (トークン無し) = LIFF 中継専用ページ。
 *
 * LIFF 外部ブラウザログインは認証後、必ず LIFF アプリの Endpoint URL に
 * 戻る。顧客固有リンク `/line/link/<token>` (LineLinkClient) は
 * `liff.login({ redirectUri: window.location.href })` で戻り先を自分自身に
 * するため、Endpoint URL は `…/line/link` に設定する必要がある。LIFF は
 * 戻り先が Endpoint URL のパス配下であることを要求し、`/line/liff` を
 * Endpoint にすると `/line/link/...` が 400 "invalid url" になる (実測)。
 *
 * このページは liff.init() だけ呼ぶ薄い中継 (LiffRelay)。liff.init() が
 * `liff.state` を検出して元の `/line/link/<token>` へ自動遷移する。
 *
 * ルート競合は無い: `/line/link` → 本ファイル、
 * `/line/link/<token>` → `[token]/page.tsx`。
 */
export default function LineLinkRelayPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-center text-sm text-gray-600">読み込み中...</p>
      }
    >
      <LiffRelay />
    </Suspense>
  );
}
