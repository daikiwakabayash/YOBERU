"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { purchaseCustomerPlan } from "../actions/customerPlanActions";
import type { PlanMenu } from "../types";

interface PlanPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  plan: PlanMenu | null;
  brandId: number;
  shopId: number;
  customerId: number | null;
  appointmentId: number | null;
  /**
   * プラン購入完了時に呼ばれる。親側で:
   *   - 購入金額を合計に追加
   *   - カルテの残数表示を再取得
   *   などに使う。
   */
  onPurchased: (result: {
    planId: number;
    plan: PlanMenu;
    consumedToday: boolean;
  }) => void;
}

export function PlanPurchaseDialog({
  open,
  onClose,
  plan,
  brandId,
  shopId,
  customerId,
  appointmentId,
  onPurchased,
}: PlanPurchaseDialogProps) {
  // 「今日を1回目として使用する」(true) か「次回を1回目として使用する」(false)。
  // 会計確定前に必ずどちらかを明示的に選んでもらうため、初期値は null にし
  // 未選択なら 購入 ボタンを disabled にする。
  const [consumeToday, setConsumeToday] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  async function handlePurchase() {
    if (!plan || !customerId) return;
    if (consumeToday === null) {
      toast.error("今日を 1 回目とするか、次回を 1 回目とするか選択してください");
      return;
    }
    setSaving(true);
    const result = await purchaseCustomerPlan({
      brandId,
      shopId,
      customerId,
      menuManageId: plan.menu_manage_id,
      consumeToday,
      appointmentId,
    });
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${plan.name} を購入しました`);
    onPurchased({ planId: result.planId!, plan, consumedToday: consumeToday });
    setConsumeToday(null);
    onClose();
  }

  if (!plan) return null;
  const isTicket = plan.plan_type === "ticket";
  const planTypeLabel = isTicket
    ? `${plan.ticket_count ?? 1}回券`
    : "月額サブスクリプション";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan.name} を購入</DialogTitle>
          <DialogDescription>
            {planTypeLabel} ・ ¥{plan.price.toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* 今日を 1 回目か、次回から 1 回目かを明示的に選ばせる。
              チケットの場合: 今日 → used_count=1 で開始。次回 → used_count=0。
              サブスクの場合: UI 上の意味は薄いが、会計フローの整合性のため
              同じ選択を求める (内部的には used_count は常に 0)。 */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-600">
              初回消化タイミング
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConsumeToday(true)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  consumeToday === true
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 bg-white hover:border-orange-300"
                }`}
              >
                <div className="text-sm font-bold">今日を 1 回目として使用</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  購入と同時にこの予約を 1 回目として消化
                </div>
              </button>
              <button
                type="button"
                onClick={() => setConsumeToday(false)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  consumeToday === false
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-blue-300"
                }`}
              >
                <div className="text-sm font-bold">次回を 1 回目として使用</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  今日は消化せず、次回予約から 1 回目としてカウント
                </div>
              </button>
            </div>
          </div>

          {isTicket && (
            <p className="text-[11px] text-gray-500">
              購入時点で合計 {plan.ticket_count} 回分のチケットを発行します。
              消化するたびにカルテに残数が反映されます。
            </p>
          )}
          {!isTicket && (
            <p className="text-[11px] text-gray-500">
              月額サブスクリプションとして登録します。毎月の継続決済は
              予約表の「継続決済」枠から別途記録してください。
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={saving || consumeToday === null}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {saving ? "購入中..." : "購入する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
