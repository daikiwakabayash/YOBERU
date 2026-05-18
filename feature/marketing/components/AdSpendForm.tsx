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

interface BookingLinkOption {
  id: number;
  title: string;
  visit_source_id: number | null;
  symptom: string | null;
  offer_price: number | null;
}

interface AdSpendFormProps {
  brandId: number;
  shopId: number;
  shopName: string | null;
  visitSources: Array<{ id: number; name: string }>;
  rows: AdSpendRow[];
  monthOptions: string[]; // YYYY-MM
  /** クリエイティブ単位入力に使う、対象店舗の強制リンク一覧 (migration 00050) */
  bookingLinks: BookingLinkOption[];
  /**
   * Set true when the underlying ad_spend table is missing (migration
   * not yet applied). Disables the save button and the row actions so
   * the user gets a clear "do the migration first" experience.
   */
  disabled?: boolean;
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
  bookingLinks,
  disabled = false,
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
  /** 配布数 / 表示回数。チラシなら配布枚数、Meta 広告なら impressions。
   *  Meta は API 同期で自動入力されるので、その値を上書きしないよう
   *  入力が空のときは upsert 時に null を渡して既存値を維持する。 */
  const [impressionsInput, setImpressionsInput] = useState("");
  const [memo, setMemo] = useState("");
  /** 入力モード:
   *  'media'    = 媒体全体の月次広告費 (従来通り)
   *  'creative' = 強制リンク (クリエイティブ) 単位の広告費 (migration 00050) */
  const [mode, setMode] = useState<"media" | "creative">("media");
  const [bookingLinkId, setBookingLinkId] = useState<number | "">(
    bookingLinks[0]?.id ?? ""
  );
  /** 編集中の行 id。null = 新規入力モード。
   *  これを管理することで「編集ボタンを押したのに何も変わらない」と
   *  感じる UX (= フォーム位置が左 / 上のため反映が見えない) を解消し、
   *  該当行をハイライト / 保存ボタンを「更新」にラベル変更 / キャンセル
   *  ボタンで離脱できる、という分かりやすい編集モードを提供する。 */
  const [editingId, setEditingId] = useState<number | null>(null);

  function handleSubmit() {
    // 媒体モード: 媒体必須。クリエイティブモード: 強制リンク必須 (媒体は
    // リンクから引き当てるので UI 上は省略可能)。
    if (mode === "media" && !sourceId) {
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
    // クリエイティブ単位入力時は、選択された強制リンクから visit_source_id を
    // 自動引き当てしてサーバーに送る (UI で媒体を選ぶ必要を減らす)。
    let effectiveSourceId: number | "" = sourceId;
    let effectiveLinkId: number | null = null;
    if (mode === "creative") {
      if (!bookingLinkId) {
        toast.error("強制リンクを選択してください");
        return;
      }
      const link = bookingLinks.find((b) => b.id === Number(bookingLinkId));
      if (link?.visit_source_id) {
        effectiveSourceId = link.visit_source_id;
      }
      if (!effectiveSourceId) {
        toast.error(
          "選択した強制リンクに媒体が設定されていません。先に強制リンクの「媒体選択」を保存してください。"
        );
        return;
      }
      effectiveLinkId = Number(bookingLinkId);
    }

    const impressionsRaw = impressionsInput.trim();
    const impressionsNum = impressionsRaw === "" ? null : Number(impressionsRaw);
    if (
      impressionsNum != null &&
      (!Number.isFinite(impressionsNum) || impressionsNum < 0)
    ) {
      toast.error("配布数 / 表示回数は 0 以上の数値で入力してください");
      return;
    }

    startTransition(async () => {
      const result = await upsertAdSpend({
        brand_id: brandId,
        shop_id: shopId,
        visit_source_id: Number(effectiveSourceId),
        year_month: yearMonth,
        amount: amt,
        memo: memo || null,
        booking_link_id: effectiveLinkId,
        impressions: impressionsNum,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editingId ? "更新しました" : "広告費を保存しました");
      setAmount("");
      setImpressionsInput("");
      setMemo("");
      setEditingId(null);
      router.refresh();
    });
  }

  function handleEdit(row: AdSpendRow) {
    setEditingId(row.id);
    setYearMonth(row.year_month);
    setSourceId(row.visit_source_id);
    setAmount(String(row.amount));
    setImpressionsInput(
      row.impressions != null && row.impressions > 0
        ? String(row.impressions)
        : ""
    );
    setMemo(row.memo ?? "");
    if (row.booking_link_id != null) {
      setMode("creative");
      setBookingLinkId(row.booking_link_id);
    } else {
      setMode("media");
      setBookingLinkId("");
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    // 編集対象がフォームに乗ったことをユーザーに即フィードバック
    toast.info(
      `${formatMonthLabel(row.year_month)} ${row.source_name ?? "(不明)"} を編集中`
    );
  }

  function handleCancelEdit() {
    setEditingId(null);
    setAmount("");
    setImpressionsInput("");
    setMemo("");
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
        <Card className={editingId ? "border-orange-300 ring-1 ring-orange-200" : ""}>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "編集中" : "広告費を入力"}
              {editingId && (
                <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                  上書き保存
                </span>
              )}
            </CardTitle>
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
            {/* 入力モード切替: 媒体単位 / 強制リンク (クリエイティブ) 単位 */}
            <div className="space-y-2">
              <Label>入力単位</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("media")}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "media"
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  媒体単位
                </button>
                <button
                  type="button"
                  onClick={() => setMode("creative")}
                  disabled={bookingLinks.length === 0}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "creative"
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  }`}
                >
                  強制リンク単位
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                強制リンク単位で入力すると「症状 × オファー価格 × 店舗」軸で CPA / 入会率を分析できます。
              </p>
            </div>
            {mode === "media" ? (
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
            ) : (
              <div className="space-y-2">
                <Label>強制リンク (クリエイティブ)</Label>
                <select
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  value={bookingLinkId}
                  onChange={(e) =>
                    setBookingLinkId(
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                >
                  <option value="">選択してください</option>
                  {bookingLinks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                      {b.symptom ? ` / ${b.symptom}` : ""}
                      {b.offer_price != null
                        ? ` / ¥${b.offer_price.toLocaleString()}`
                        : ""}
                    </option>
                  ))}
                </select>
                {bookingLinks.length === 0 && (
                  <p className="text-[11px] text-amber-700">
                    この店舗に強制リンクがありません。先に「強制リンク」マスターで作成してください。
                  </p>
                )}
              </div>
            )}
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
              <Label>枚数 / 表示回数 (任意)</Label>
              <Input
                type="number"
                min={0}
                value={impressionsInput}
                onChange={(e) => setImpressionsInput(e.target.value)}
                placeholder="例: 1500 (チラシ枚数 / 広告 impression)"
              />
              <p className="text-[11px] text-muted-foreground">
                チラシなら配布枚数、Meta 広告なら表示回数。空欄で未入力扱い。
              </p>
            </div>
            <div className="space-y-2">
              <Label>メモ</Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="任意 (例: CPC キャンペーン名)"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={pending || disabled}
                className="flex-1"
              >
                {pending
                  ? "保存中..."
                  : disabled
                    ? "セットアップ未完了"
                    : editingId
                      ? "更新する"
                      : "保存する"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={pending}
                >
                  キャンセル
                </Button>
              )}
            </div>
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
                    <th className="px-4 py-2 text-left font-medium">媒体 / クリエイティブ</th>
                    <th className="px-4 py-2 text-right font-medium">金額</th>
                    <th className="px-4 py-2 text-right font-medium">枚数</th>
                    <th className="px-4 py-2 text-left font-medium">メモ</th>
                    <th className="px-4 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        入力済みの広告費はありません
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={r.id}
                        className={
                          editingId === r.id
                            ? "bg-orange-50/70"
                            : "hover:bg-gray-50/60"
                        }
                      >
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {formatMonthLabel(r.year_month)}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          <div>{r.source_name ?? "(不明)"}</div>
                          {r.booking_link_id != null && (
                            <div className="mt-0.5 text-[11px] text-orange-700">
                              ▸ {r.booking_link_title ?? `link #${r.booking_link_id}`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {yen(r.amount)}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {r.impressions != null && r.impressions > 0
                            ? r.impressions.toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {r.memo ?? ""}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(r)}
                            disabled={disabled}
                          >
                            編集
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(r.id)}
                            disabled={disabled}
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
