"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 顧客詳細 / 編集 / 写真ページから「直前にいた画面」へ戻るボタン。
 *
 * 予約パネルの「写真・動画」「基本情報を編集」リンクは別ページに
 * 飛ばすので、戻り先が顧客一覧とは限らない (予約表のことが多い)。
 * router.back() なら来た経路に関わらず元の画面に戻れるが、ブラウザ
 * 履歴が無い直接アクセスのケースに備えて顧客一覧へ fallback する。
 */
export function CustomerBackButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/customer");
        }
      }}
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      前のページに戻る
    </Button>
  );
}
