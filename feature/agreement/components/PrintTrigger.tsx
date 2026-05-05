"use client";

import { useEffect } from "react";

/**
 * /agree/<uuid>?print=1 で開かれた時に、レンダリング完了後に
 * 一度だけ window.print() を呼ぶクライアントコンポーネント。
 *
 * ブラウザの印刷ダイアログから「PDF として保存」を選ぶことで、
 * LINE / メール未登録の顧客にも控えを渡せるようにする。
 */
export function PrintTrigger() {
  useEffect(() => {
    // フォントや画像 (署名 base64 PNG) のレイアウトが落ち着くまで
    // 少し待ってから print。0ms だと Safari で署名画像が空のまま
    // 印刷ダイアログが開くケースがあるため 300ms 程度の余裕を取る。
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* ユーザーが既にダイアログを閉じた場合などは無視 */
      }
    }, 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
