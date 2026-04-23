import { Suspense } from "react";
import { LiffEntry } from "./LiffEntry";

/**
 * LIFF エントリポイント。
 *
 * LINE 公式アカウントのリッチメニューから飛ぶ先。リッチメニュー側で
 * `?menu=book` / `?menu=mypage` / `?menu=questionnaire` などを付けて
 * おき、ここでサーバサイドリダイレクト or クライアント側で LIFF SDK を
 * 使って userId を取得 → customer に紐付けした上で目的ページへ遷移する。
 *
 * 実装は段階的:
 *   v1 (現在): クライアントで `?menu=<key>` に応じた遷移先へ飛ばすだけ
 *   v2 (将来): liff.getProfile() で userId を取り customer にバインド
 */

export const metadata = {
  title: "LINE メニュー",
};

export default function LiffPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center">読み込み中...</p>}>
      <LiffEntry />
    </Suspense>
  );
}
