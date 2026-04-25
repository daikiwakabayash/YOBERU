"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

/**
 * 請求書ページの上部に貼る薄い操作バー (印刷ボタン + 戻る)。
 *
 * autoPrint=true (URL に ?print=1 を付けたケース) ではマウント直後に
 * window.print() を一度だけ叩いて、ユーザーが「ブラウザの 印刷 → PDF
 * として保存」を 1 タップで開ける状態にする。
 *
 * このバー自体は @media print で display: none に倒される (印刷物には
 * 出ない)。
 */
export function InvoicePrintTrigger({
  backHref,
  autoPrint,
}: {
  backHref: string;
  autoPrint: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    // 少し待ってから print (フォント描画完了を待つ)
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2 print:hidden"
    >
      <Link href={backHref}>
        <Button variant="outline" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          給与内訳へ戻る
        </Button>
      </Link>
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        印刷 / PDF として保存
      </Button>
    </div>
  );
}
