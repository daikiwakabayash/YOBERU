"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import {
  addAllowanceUsage,
  deleteAllowanceUsage,
} from "../actions/allowanceActions";

export interface UsageRow {
  id: number;
  yearMonth: string;
  amount: number;
  note: string | null;
}

interface Props {
  staffId: number;
  yearMonth: string;
  allowanceType: "study" | "event_access";
  label: string;
  balance: number; // 現在の残枠 (累積付与 - 累積使用)
  rows: UsageRow[]; // 当年内の使用履歴
}

export function AllowanceUsageList({
  staffId,
  yearMonth,
  allowanceType,
  label,
  balance,
  rows,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("金額は 1 円以上で入力してください");
      return;
    }
    if (amt > balance) {
      if (
        !confirm(
          `残枠 (¥${balance.toLocaleString()}) を超えています。それでも記録しますか？`
        )
      ) {
        return;
      }
    }
    start(async () => {
      const res = await addAllowanceUsage({
        staffId,
        allowanceType,
        yearMonth,
        amount: amt,
        note: note.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${label} の使用を記録しました`);
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  function removeRow(id: number) {
    if (!confirm("この使用記録を削除します。よろしいですか？")) return;
    start(async () => {
      const res = await deleteAllowanceUsage(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("削除しました");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold">{label}</h3>
        <span className="text-xs text-gray-500">
          残枠:{" "}
          <span className="font-bold text-blue-700">
            ¥{balance.toLocaleString()}
          </span>
        </span>
      </div>

      {/* 当年使用履歴 */}
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">今年の使用記録はまだありません</p>
      ) : (
        <ul className="divide-y rounded border text-xs">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 px-3 py-2"
            >
              <span className="w-20 shrink-0 text-gray-500">
                {r.yearMonth}
              </span>
              <span className="w-20 shrink-0 tabular-nums font-medium">
                ¥{r.amount.toLocaleString()}
              </span>
              <span className="flex-1 truncate text-gray-600" title={r.note ?? ""}>
                {r.note ?? "—"}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeRow(r.id)}
                className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                title="削除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 新規追加フォーム */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_auto]">
        <div>
          <Label className="text-[10px] text-gray-500">
            金額 ({yearMonth})
          </Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例: 5000"
          />
        </div>
        <div>
          <Label className="text-[10px] text-gray-500">メモ (任意)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例: 研修会参加費 / セミナーチケット"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={pending}
            className="w-full"
          >
            <Plus className="mr-1 h-3 w-3" />
            記録
          </Button>
        </div>
      </div>
    </div>
  );
}
