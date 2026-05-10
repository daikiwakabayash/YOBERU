"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  assignPendingLineLink,
  dismissPendingLineLink,
} from "../actions/lineLinkQueueActions";
import type {
  PendingLineLinkWithCandidates,
  CandidateCustomer,
} from "../services/getPendingLineLinks";

interface Props {
  pending: PendingLineLinkWithCandidates;
}

function formatJpDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function candidateLabel(c: CandidateCustomer): string {
  const name = [c.lastName, c.firstName].filter(Boolean).join(" ");
  return name || c.code || `#${c.id}`;
}

export function PendingLineLinkRow({ pending }: Props) {
  const router = useRouter();
  const [pendingTr, startTransition] = useTransition();
  const [confirmState, setConfirmState] = useState<{
    customerId: number;
    customerLabel: string;
    existingCustomerName: string;
    existingCustomerCode: string;
  } | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  function doAssign(customer: CandidateCustomer, force: boolean): void {
    startTransition(async () => {
      const res = await assignPendingLineLink({
        pendingId: pending.id,
        customerId: customer.id,
        force,
      });
      if (res.requiresConfirmation) {
        setConfirmState({
          customerId: customer.id,
          customerLabel: candidateLabel(customer),
          existingCustomerName: res.requiresConfirmation.existingCustomerName,
          existingCustomerCode: res.requiresConfirmation.existingCustomerCode,
        });
        return;
      }
      if (res.error) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      toast.success(`${candidateLabel(customer)} と紐付けました`);
      setConfirmState(null);
      router.refresh();
    });
  }

  function doDismiss(): void {
    startTransition(async () => {
      const res = await dismissPendingLineLink({
        pendingId: pending.id,
        reason: dismissReason.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("保留行を破棄しました");
      setDismissOpen(false);
      router.refresh();
    });
  }

  const initial =
    pending.displayName?.slice(0, 1) ?? pending.lineUserId.slice(1, 2) ?? "?";

  return (
    <>
      <li className="rounded-lg border bg-white p-4">
        {/* ヘッダ: LINE プロフィール */}
        <div className="flex items-start gap-3 border-b pb-3">
          {pending.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pending.pictureUrl}
              alt="LINE icon"
              className="h-12 w-12 rounded-full border object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-base font-bold text-green-700">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-sm font-semibold">
                {pending.displayName ?? "(表示名なし)"}
              </p>
              <Badge
                variant="outline"
                className="bg-amber-50 text-[10px] text-amber-700"
              >
                未紐付け
              </Badge>
            </div>
            <p className="break-all font-mono text-[10px] text-gray-500">
              {pending.lineUserId}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {formatJpDateTime(pending.followedAt)} に友だち追加
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600"
            onClick={() => setDismissOpen(true)}
            disabled={pendingTr}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            該当なしで破棄
          </Button>
        </div>

        {/* 候補顧客 */}
        <div className="pt-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-600">
            <Search className="h-3 w-3" />
            候補の顧客 ({pending.candidates.length} 件)
          </p>

          {pending.candidates.length === 0 ? (
            <div className="rounded border border-dashed bg-gray-50 p-3 text-center text-xs text-gray-500">
              <p>名前 / 直近予約に一致する顧客が見つかりませんでした。</p>
              <p className="mt-1">
                顧客一覧から個別に該当顧客のページを開き、
                「公式 LINE 紐付け」セクションのリンクをこの方に送って紐付け
                してもらってください。
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pending.candidates.map((c) => {
                const recent = c.recentAppointmentAt
                  ? formatJpDateTime(c.recentAppointmentAt)
                  : null;
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-2 rounded border bg-white p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <p className="text-sm font-semibold">
                          {candidateLabel(c)}
                        </p>
                        {c.code && (
                          <span className="font-mono text-[10px] text-gray-400">
                            {c.code}
                          </span>
                        )}
                        {c.hasLineLink && (
                          <Badge
                            variant="outline"
                            className="bg-rose-50 text-[10px] text-rose-700"
                          >
                            別の LINE 紐付け済
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                        {c.lastNameKana || c.firstNameKana ? (
                          <span>
                            {[c.lastNameKana, c.firstNameKana]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        ) : null}
                        {c.phoneTail4 && (
                          <span>TEL 下4桁: {c.phoneTail4}</span>
                        )}
                        {recent && <span>直近予約 {recent}</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {c.matchReason.map((r) => (
                          <span
                            key={r}
                            className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={`/customer/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="mr-1 h-3 w-3" />
                          カルテ
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        disabled={pendingTr}
                        onClick={() => doAssign(c, false)}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        この顧客に紐付け
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </li>

      {/* 上書き確認ダイアログ */}
      <Dialog
        open={!!confirmState}
        onOpenChange={(o) => {
          if (!o) setConfirmState(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              既存の紐付けを上書きしますか？
            </DialogTitle>
          </DialogHeader>
          {confirmState && (
            <div className="space-y-3 text-sm">
              <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs">
                <p>
                  <span className="font-semibold">
                    {confirmState.existingCustomerName}
                  </span>
                  {confirmState.existingCustomerCode && (
                    <span className="ml-1 font-mono text-gray-500">
                      ({confirmState.existingCustomerCode})
                    </span>
                  )}
                  {" "}
                  に既に別の LINE が紐付いています。
                </p>
                <p className="mt-1">
                  続行すると、既存の紐付けは解除され、リマインドはこの新しい
                  紐付けの LINE 宛に送られるようになります。
                </p>
              </div>
              <p>
                本当に <strong>{confirmState.customerLabel}</strong> へ紐付け
                直しますか？
              </p>
              <p className="text-xs text-gray-500">
                ※ 誤送信防止のため、不安な場合はまず該当顧客のカルテで
                「紐付け解除」を行ってから、もう一度この操作をしてください。
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmState(null)}
              disabled={pendingTr}
            >
              キャンセル
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              disabled={pendingTr}
              onClick={() => {
                if (!confirmState) return;
                const cand = pending.candidates.find(
                  (c) => c.id === confirmState.customerId
                );
                if (cand) doAssign(cand, true);
              }}
            >
              上書きして紐付ける
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 破棄ダイアログ */}
      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保留行を破棄します</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              この LINE ユーザを「該当顧客なし」として破棄します。
              監査用に行は残り、以後この LINE 宛にはリマインドが送られません。
            </p>
            <label className="text-xs text-gray-500">理由 (任意)</label>
            <input
              type="text"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="例: スタッフ自身のテスト追加 / 該当顧客が見当たらない"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDismissOpen(false)}
              disabled={pendingTr}
            >
              キャンセル
            </Button>
            <Button
              variant="ghost"
              className="text-rose-600"
              disabled={pendingTr}
              onClick={doDismiss}
            >
              破棄する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
