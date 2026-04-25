"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Save } from "lucide-react";
import {
  addAllowanceUsage,
  deleteAllowanceUsage,
  saveAllowanceDefault,
} from "../actions/allowanceActions";
import type { AllowanceCode } from "../allowanceTypes";

export interface UsageRow {
  id: number;
  yearMonth: string;
  amount: number;
  note: string | null;
}

interface Props {
  staffId: number;
  yearMonth: string;
  allowanceType: AllowanceCode;
  label: string;
  /** carryover (study/event) は残枠、claim は当月使用累計を見せる */
  balance?: number;
  /** "残枠" / "当月使用" 等のラベル切替用 */
  balanceLabel?: string;
  rows: UsageRow[];
  /** 補足説明 (受給条件 / 上限等) */
  hint?: string;
  /**
   * デフォルト保存値。enabled=true ならフォームに amount/note を prefill。
   * 未保存 (= null) なら従来どおり空白で開く。
   */
  defaultValue: {
    amount: number;
    note: string | null;
    enabled: boolean;
  } | null;
}

export function AllowanceUsageList({
  staffId,
  yearMonth,
  allowanceType,
  label,
  balance,
  balanceLabel,
  rows,
  hint,
  defaultValue,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // prefill: enabled なデフォルトがあれば値を入れる。チェックボックスも
  // 同じく enabled に倒す → ユーザーは「そのまま登録 → 翌月も同じ値で
  // prefill」のフローで何もしなくて良い。
  const [amount, setAmount] = useState<string>(
    defaultValue?.enabled ? String(defaultValue.amount) : ""
  );
  const [note, setNote] = useState<string>(
    defaultValue?.enabled ? defaultValue.note ?? "" : ""
  );
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(
    !!defaultValue?.enabled
  );

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("金額は 1 円以上で入力してください");
      return;
    }
    if (balance != null && amt > balance) {
      if (
        !confirm(
          `残枠 (¥${balance.toLocaleString()}) を超えています。それでも記録しますか？`
        )
      ) {
        return;
      }
    }
    start(async () => {
      // 1. 当月の使用記録を 1 行追加
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

      // 2. 「毎月同じ値を使う」がチェックされていればデフォルトとして保存。
      //    チェックが外れていて、かつ既存のデフォルトが enabled だった場合は
      //    enabled=false に倒して prefill を停止する。
      if (saveAsDefault) {
        await saveAllowanceDefault({
          staffId,
          allowanceType,
          amount: amt,
          note: note.trim() || null,
          enabled: true,
        });
      } else if (defaultValue?.enabled) {
        await saveAllowanceDefault({
          staffId,
          allowanceType,
          amount: defaultValue.amount,
          note: defaultValue.note,
          enabled: false,
        });
      }

      const baseMsg = `${label} の使用を記録しました`;
      if (res.warning) {
        toast.warning(`${baseMsg} (注意: ${res.warning})`);
      } else {
        toast.success(baseMsg);
      }

      // 入力リセット (チェックが入っていれば次回も同じ値で prefill されるので
      // form 自体もデフォルト値に戻す)。
      if (saveAsDefault) {
        // そのまま値を残しておく (次月に open し直すと prefill される)
      } else {
        setAmount("");
        setNote("");
      }
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
        {balance != null && (
          <span className="text-xs text-gray-500">
            {balanceLabel ?? "残枠"}:{" "}
            <span className="font-bold text-blue-700">
              ¥{balance.toLocaleString()}
            </span>
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}

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
      <div className="space-y-2">
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

        {/* デフォルト保存チェック */}
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <Checkbox
            checked={saveAsDefault}
            onCheckedChange={(v) => setSaveAsDefault(v === true)}
          />
          <span>
            この金額・メモを毎月のデフォルトとして保存する
            <span className="ml-1 text-[10px] text-gray-400">
              (チェックを外せば翌月以降は空白で開きます)
            </span>
          </span>
          {defaultValue?.enabled && (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
              <Save className="h-3 w-3" />
              デフォルト保存中
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
