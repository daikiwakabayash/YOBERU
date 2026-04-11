"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  upsertAdSpend,
  deleteAdSpend,
} from "../actions/adSpendActions";
import type { AdSpendRow } from "../services/getAdSpend";
import { Trash2 } from "lucide-react";

interface AdSpendFormProps {
  brandId: number;
  shopId: number;
  shopName: string | null;
  visitSources: Array<{ id: number; name: string }>;
  rows: AdSpendRow[];
  monthOptions: string[]; // YYYY-MM
}

function yen(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "¥0";
  return `¥${Math.round(n).toLocaleString()}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y.slice(2)}年${Number(m)}月`;
}

/**
 * 広告費 entry + list. The form is keyed by (shop, media, month) so
 * re-entering the same combination overwrites the previous row.
 */
export function AdSpendForm({
  brandId,
  shopId,
  shopName,
  visitSources,
  rows,
  monthOptions,
}: AdSpendFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [yearMonth, setYearMonth] = useState(
    monthOptions[monthOptions.length - 2] ?? monthOptions[0] ?? ""
  );
  const [sourceId, setSourceId] = useState<number | "">(
    visitSources[0]?.id ?? ""
  );
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  function handleSubmit() {
    if (!sourceId) {
      toast.error("媒体を選択してください");
      return;
    }
    if (!yearMonth) {
      toast.error("月を選択してください");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("金額は 0 以上の数値で入力してください");
      return;
    }
    startTransition(async () => {
      const result = await upsertAdSpend({
        brand_id: brandId,
        shop_id: shopId,
        visit_source_id: Number(sourceId),
        year_month: yearMonth,
        amount: amt,
        memo: memo || null,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("広告費を保存しました");
      setAmount("");
      setMemo("");
      router.refresh();
    });
  }

  function handleEdit(row: AdSpendRow) {
    setYearMonth(row.year_month);
    setSourceId(row.visit_source_id);
    setAmount(String(row.amount));
    setMemo(row.memo ?? "");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("この広告費を削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteAdSpend(id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
      router.refresh();
    });
  }

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Entry form */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">広告費を入力</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
              管理中の店舗
              <div className="mt-0.5 text-sm font-bold text-gray-900">
                {shopName ?? `shop #${shopId}`}
              </div>
            </div>
            <div className="space-y-2">
              <Label>月</Label>
              <select
                className="h-9 w-full rounded-md border px-3 text-sm"
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>媒体</Label>
              <select
                className="h-9 w-full rounded-md border px-3 text-sm"
                value={sourceId}
                onChange={(e) =>
                  setSourceId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">選択してください</option>
                {visitSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {visitSources.length === 0 && (
                <p className="text-[11px] text-amber-700">
                  この店舗に媒体が登録されていません。先に「来店経路」マスターを作成してください。
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>金額 (円)</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 300000"
              />
            </div>
            <div className="space-y-2">
              <Label>メモ</Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="任意 (例: CPC キャンペーン名)"
              />
            </div>
            <Button onClick={handleSubmit} disabled={pending} className="w-full">
              {pending ? "保存中..." : "保存する"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              同じ 月 × 媒体 の組み合わせは上書き保存されます。
            </p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>入力済みの広告費</span>
              <span className="text-sm font-normal text-gray-500">
                合計 {yen(total)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">月</th>
                    <th className="px-4 py-2 text-left font-medium">媒体</th>
                    <th className="px-4 py-2 text-right font-medium">金額</th>
                    <th className="px-4 py-2 text-left font-medium">メモ</th>
                    <th className="px-4 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        入力済みの広告費はありません
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {formatMonthLabel(r.year_month)}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {r.source_name ?? "(不明)"}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {yen(r.amount)}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {r.memo ?? ""}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(r)}
                          >
                            編集
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(r.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
