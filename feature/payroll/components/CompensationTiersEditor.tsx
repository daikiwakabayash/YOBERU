"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import {
  upsertCompensationTier,
  deleteCompensationTier,
} from "../actions/compensationTierActions";
import type { CompensationTier } from "../services/getCompensationTiers";

interface Props {
  brandId: number;
  initialTiers: CompensationTier[];
}

interface TierDraft {
  id: number | null; // 既存行は number、新規行は null
  salesThreshold: string;
  percentage: string;
}

const yen = (n: number) => `¥${n.toLocaleString()}`;

export function CompensationTiersEditor({ brandId, initialTiers }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<TierDraft[]>(() =>
    initialTiers.map((t) => ({
      id: t.id,
      salesThreshold: String(t.salesThreshold),
      percentage: String(t.percentage),
    }))
  );

  function updateDraft(idx: number, patch: Partial<TierDraft>) {
    setDrafts((d) => d.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setDrafts((d) => [...d, { id: null, salesThreshold: "", percentage: "" }]);
  }

  function saveRow(idx: number) {
    const row = drafts[idx];
    const threshold = Number(row.salesThreshold);
    const pct = Number(row.percentage);
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast.error("売上閾値は 0 以上の整数で入力してください");
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("% は 0 〜 100 で入力してください");
      return;
    }
    start(async () => {
      const result = await upsertCompensationTier({
        brandId,
        salesThreshold: threshold,
        percentage: pct,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("保存しました");
      router.refresh();
    });
  }

  function deleteRow(idx: number) {
    const row = drafts[idx];
    if (row.id == null) {
      // 未保存の新規行は単に画面から消すだけ
      setDrafts((d) => d.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm("この閾値を削除します。よろしいですか？")) return;
    start(async () => {
      const result = await deleteCompensationTier(row.id!);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
      router.refresh();
    });
  }

  // 各行の即時プレビュー: 売上(税抜) × % = 報酬(税込) を表示する。
  function previewYen(threshold: string, percentage: string): string {
    const t = Number(threshold);
    const p = Number(percentage);
    if (!Number.isFinite(t) || !Number.isFinite(p)) return "—";
    return yen(Math.round((t * p) / 100));
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-600">
                <th className="px-3 py-2 text-left">売上(税抜) 閾値</th>
                <th className="px-3 py-2 text-left">%</th>
                <th className="px-3 py-2 text-right">業務委託費(税込) プレビュー</th>
                <th className="px-3 py-2 text-right w-40">操作</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                    閾値が登録されていません。下の「+ 行を追加」から追加してください。
                  </td>
                </tr>
              )}
              {drafts.map((row, idx) => (
                <tr key={row.id ?? `new-${idx}`} className="border-b">
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      value={row.salesThreshold}
                      onChange={(e) =>
                        updateDraft(idx, { salesThreshold: e.target.value })
                      }
                      className="w-32"
                      placeholder="例: 800000"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={row.percentage}
                        onChange={(e) =>
                          updateDraft(idx, { percentage: e.target.value })
                        }
                        className="w-24"
                        placeholder="例: 35"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {previewYen(row.salesThreshold, row.percentage)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => saveRow(idx)}
                      >
                        保存
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        className="border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => deleteRow(idx)}
                        title="削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={pending}
          >
            <Plus className="mr-1 h-4 w-4" />
            行を追加
          </Button>
          <p className="text-xs text-gray-500">
            ※ 同じ売上閾値の行を保存すると % が上書きされます (upsert)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
