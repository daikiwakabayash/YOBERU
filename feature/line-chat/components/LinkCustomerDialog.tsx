"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Loader2, Search } from "lucide-react";
import { linkLineUserToCustomer } from "../actions/linkCustomerActions";
import {
  searchCustomersForLineLink,
  type CustomerSearchHit,
} from "@/feature/customer/services/searchCustomersForLineLink";

interface LinkCustomerDialogProps {
  shopId: number;
  lineUserId: string;
  /** 紐付け Dialog を開くトリガー (テキストやアイコン) */
  triggerLabel?: string;
}

/**
 * /line-chat の未紐付けユーザー行から開く「顧客に紐付ける」ダイアログ。
 *
 * - 姓 / 電話番号 / カナで検索
 * - 候補から 1 件選んで紐付け確定
 * - 確定後は /line-chat を revalidate (server action 内)
 */
export function LinkCustomerDialog({
  shopId,
  lineUserId,
  triggerLabel = "顧客に紐付ける",
}: LinkCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<CustomerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  async function runSearch() {
    if (!keyword.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const result = await searchCustomersForLineLink({ shopId, keyword });
      setHits(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  }

  function pick(customerId: number, hasLineUserId: boolean) {
    if (hasLineUserId) {
      const ok = window.confirm(
        "この顧客には既に LINE 連携があります。上書き紐付けして良いですか?"
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await linkLineUserToCustomer({
        customerId,
        lineUserId,
      });
      if (result.success) {
        toast.success("LINE 連携を紐付けました");
        setOpen(false);
        setKeyword("");
        setHits([]);
      } else {
        toast.error(result.error ?? "紐付けに失敗しました");
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="gap-1"
      >
        <Link2 size={14} />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>LINE 連携を顧客に紐付ける</DialogTitle>
            <DialogDescription>
              この LINE ユーザーをどの顧客に紐付けるか選んでください。姓・カナ・電話番号で検索できます。
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              placeholder="例: 池袋 / イケブクロ / 09012345678"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              autoFocus
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runSearch()}
              disabled={searching || !keyword.trim()}
              className="gap-1"
            >
              {searching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              検索
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {hits.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-500">
                {searching
                  ? "検索中..."
                  : keyword
                    ? "該当する顧客がいません"
                    : "キーワードを入力して検索してください"}
              </p>
            ) : (
              <ul className="divide-y">
                {hits.map((h) => {
                  const name =
                    `${h.lastName ?? ""} ${h.firstName ?? ""}`.trim() ||
                    "(名前未登録)";
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => pick(h.id, h.hasLineUserId)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {h.phoneNumber1 ?? "(電話番号なし)"}
                          </p>
                        </div>
                        {h.hasLineUserId && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            LINE 連携済
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  );
}
