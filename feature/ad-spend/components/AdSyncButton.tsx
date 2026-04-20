"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { manualSyncShop } from "../actions/syncActions";

interface AdSyncButtonProps {
  shopId: number;
}

/**
 * 「Meta / TikTok から今すぐ同期」ボタン。クリックで manualSyncShop を呼ぶ。
 * Cron が回っていない開発環境や、最新の値を即座に反映したい時のためのもの。
 */
export function AdSyncButton({ shopId }: AdSyncButtonProps) {
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      const res = await manualSyncShop(shopId);
      const lines: string[] = [];
      for (const r of res.results) {
        const label = r.platform === "meta" ? "Meta広告" : "TikTok広告";
        if (r.ok) {
          lines.push(`${label}: ${r.fetchedRows} 件取得`);
        } else {
          lines.push(`${label}: ${r.error ?? "失敗"}`);
        }
      }
      const summary = lines.join(" / ");
      setLastResult(summary);
      if (res.ok) toast.success(summary);
      else toast.error(summary);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
        className="gap-1.5"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "同期中..." : "API から同期"}
      </Button>
      {lastResult && (
        <span className="text-[10px] text-gray-500">{lastResult}</span>
      )}
    </div>
  );
}
