"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Lock } from "lucide-react";
import {
  addDeductionUsage,
  deleteDeductionUsage,
  saveDeductionDefault,
} from "../actions/deductionActions";
import type { DeductionCode } from "../deductionTypes";

export interface DeductionRow {
  id: number;
  yearMonth: string;
  amount: number;
  note: string | null;
}

interface Props {
  staffId: number;
  yearMonth: string;
  deductionType: DeductionCode;
  label: string;
  description?: string;
  /** 当年の使用履歴 */
  rows: DeductionRow[];
  /** デフォルト保存値 (enabled=true なら金額・メモを prefill) */
  defaultValue: {
    amount: number;
    note: string | null;
    enabled: boolean;
  } | null;
}

/**
 * 控除入力 1 種別ぶんのカード。AllowanceUsageList と同じ
 * 「金額入力 + 固定保存チェック + 履歴一覧」UI パターンに揃えている。
 *
 * - チェックを ON で記録すると defaults に保存され、翌月開いたときに
 *   自動で同じ金額・メモが入る (= 固定運用)。
 * - チェックを OFF に倒して記録すると固定解除 → 翌月は空白に戻る。
 */
export function DeductionUsageList({
  staffId,
  yearMonth,
  deductionType,
  label,
  description,
  rows,
  defaultValue,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [amount, setAmount] = useState<string>(
    defaultValue?.enabled ? String(defaultValue.amount) : ""
  );
  const [note, setNote] = useState<string>(
    defaultValue?.enabled ? defaultValue.note ?? "" : ""
  );
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(
    !!defaultValue?.enabled
  );

  const totalThisMonth = rows
    .filter((r) => r.yearMonth === yearMonth)
    .reduce((s, r) => s + r.amount, 0);

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("控除額は 0 円以上で入力してください");
      return;
    }
    start(async () => {
      const res = await addDeductionUsage({
        staffId,
        deductionType,
        yearMonth,
        amount: amt,
        note: note.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (saveAsDefault) {
        await saveDeductionDefault({
          staffId,
          deductionType,
          amount: amt,
          note: note.trim() || null,
          enabled: true,
        });
      } else if (defaultValue?.enabled) {
        await saveDeductionDefault({
          staffId,
          deductionType,
          amount: defaultValue.amount,
          note: defaultValue.note,
          enabled: false,
        });
      }

      toast.success(`${label} を記録しました`);
      if (!saveAsDefault) {
        setAmount("");
        setNote("");
      }
      router.refresh();
    });
  }

  function removeRow(id: number) {
    if (!confirm("この控除記録を削除します。よろしいですか？")) return;
    start(async () => {
      const res = await deleteDeductionUsage(id);
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
          今月控除合計:{" "}
          <span className="font-bold tabular-nums text-rose-700">
            ¥{totalThisMonth.toLocaleString()}
          </span>
        </span>
      </div>
      {description && <p className="text-[11px] text-gray-500">{description}</p>}

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">今年の控除記録はまだありません</p>
      ) : (
        <ul className="divide-y rounded border text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-20 shrink-0 text-gray-500">{r.yearMonth}</span>
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

      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_auto]">
          <div>
            <Label className="text-[10px] text-gray-500">
              金額 ({yearMonth})
            </Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例: 12000"
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">メモ (任意)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 健康保険組合 X / 標準報酬月額 22 等級"
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

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <Checkbox
            checked={saveAsDefault}
            onCheckedChange={(v) => setSaveAsDefault(v === true)}
          />
          <span>
            この金額・メモを毎月のデフォルト (固定値) として保存する
            <span className="ml-1 text-[10px] text-gray-400">
              (チェックを外せば翌月以降は空白で開きます)
            </span>
          </span>
          {defaultValue?.enabled && (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
              <Lock className="h-3 w-3" />
              固定中
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
