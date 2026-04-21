"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  adjustPlanUsedCount,
  setPlanUsedCount,
} from "../actions/customerPlanActions";

interface PlanCountEditorProps {
  planId: number;
  planType: "ticket" | "subscription";
  /** 総回数。チケットは必須・サブスクは null のとき無制限扱い */
  totalCount: number | null;
  usedCount: number;
}

/**
 * 顧客プランの used_count を +/- ボタン or 直接入力で修正できるエディタ。
 * - サブスクで total_count が null (無制限) のときは残数表示のみでボタン非表示
 * - 手動修正時は setPlanUsedCount で上限クランプ + 状態遷移も一緒に保存
 * - useTransition で router.refresh() する
 */
export function PlanCountEditor({
  planId,
  planType,
  totalCount,
  usedCount,
}: PlanCountEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(usedCount));

  const remaining =
    totalCount != null ? Math.max(0, totalCount - usedCount) : null;

  function apply(delta: number) {
    startTransition(async () => {
      const result = await adjustPlanUsedCount(planId, delta);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("回数を更新しました");
      router.refresh();
    });
  }

  function commitDirect() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("0 以上の整数を入力してください");
      return;
    }
    startTransition(async () => {
      const result = await setPlanUsedCount(planId, Math.floor(n));
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("回数を更新しました");
      setEditing(false);
      router.refresh();
    });
  }

  // 無制限サブスク: 回数管理不要
  if (planType === "subscription" && totalCount == null) {
    return (
      <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
        契約中 (無制限)
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={totalCount ?? undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-16 text-right text-sm"
          autoFocus
        />
        {totalCount != null && (
          <span className="text-xs text-muted-foreground">/ {totalCount}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={commitDirect}
          title="保存"
        >
          <Check className="h-4 w-4 text-emerald-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setDraft(String(usedCount));
          }}
          title="キャンセル"
        >
          <X className="h-4 w-4 text-gray-500" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending || usedCount <= 0}
        onClick={() => apply(-1)}
        title="1 回減らす"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="min-w-[4rem] text-right">
        <span className="text-lg font-bold text-emerald-700">
          {remaining ?? usedCount}
        </span>
        <span className="ml-1 text-xs text-muted-foreground">
          {totalCount != null ? `/ ${totalCount} 残` : "回 使用"}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={
          pending ||
          (totalCount != null && usedCount >= totalCount)
        }
        onClick={() => apply(+1)}
        title="1 回増やす"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setDraft(String(usedCount));
          setEditing(true);
        }}
        title="直接入力で修正"
      >
        <Pencil className="h-4 w-4 text-gray-500" />
      </Button>
    </div>
  );
}
