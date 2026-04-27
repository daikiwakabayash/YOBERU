"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DashboardHeader に常駐する「更新」ボタン。
 * router.refresh() で現在のサーバーコンポーネントを再実行するので、
 * ブラウザのリロードを使わずにあらゆるページの最新化が可能。
 *
 * トランジション中はアイコンを回転させて視覚的にフィードバック。
 */
export function HeaderRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-label="ページを更新"
      title="ページを更新"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-60 sm:h-8 sm:w-8"
    >
      <RefreshCw
        size={18}
        className={cn("transition-transform", pending && "animate-spin")}
      />
    </button>
  );
}
