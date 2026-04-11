"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SlotBlockType } from "../types";
import {
  createSlotBlockType,
  updateSlotBlockType,
  deleteSlotBlockType,
} from "../actions/slotBlockTypeActions";

interface SlotBlockTypeListProps {
  types: SlotBlockType[];
  brandId: number;
}

export function SlotBlockTypeList({
  types: initial,
  brandId,
}: SlotBlockTypeListProps) {
  const [rows, setRows] = useState(initial);
  const [savingId, setSavingId] = useState<number | null>(null);

  function updateLocal(id: number, patch: Partial<SlotBlockType>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleSave(row: SlotBlockType) {
    setSavingId(row.id);
    const form = new FormData();
    form.set("label", row.label);
    form.set("color", row.color ?? "#9333ea");
    form.set("label_text_color", row.label_text_color ?? "#ffffff");
    form.set("sort_number", String(row.sort_number));
    form.set("is_active", row.is_active ? "true" : "false");
    form.set("code", row.code);
    const result = await updateSlotBlockType(row.id, form);
    setSavingId(null);
    if (result.error) {
      toast.error("更新に失敗しました");
    } else {
      toast.success("更新しました");
    }
  }

  async function handleAdd() {
    const form = new FormData();
    form.set("brand_id", String(brandId));
    form.set("label", "新しい種別");
    form.set("color", "#9333ea");
    form.set("label_text_color", "#ffffff");
    form.set("sort_number", String(rows.length + 1));
    form.set("is_active", "true");
    const result = await createSlotBlockType(form);
    if (result.error) {
      toast.error("追加に失敗しました");
    } else {
      toast.success("追加しました");
      location.reload();
    }
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`「${label}」を削除しますか？`)) return;
    const result = await deleteSlotBlockType(id);
    if (result.error) {
      toast.error("削除に失敗しました");
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("削除しました");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        ※ 予約表で「ミーティング / 休憩 / その他」など、お客様の予約以外で枠を確保するための種別を管理します。ここで設定したラベル・色は予約入力パネルのボタンと予約カードの表示に反映されます。これらは稼働率・売上集計には含まれません。
      </p>

      <div className="flex justify-end">
        <Button onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" />
          追加する
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">並び順</TableHead>
            <TableHead className="w-32">コード</TableHead>
            <TableHead>表示名</TableHead>
            <TableHead className="w-28 text-center">背景色</TableHead>
            <TableHead className="w-28 text-center">文字色</TableHead>
            <TableHead className="w-40 text-center">プレビュー</TableHead>
            <TableHead className="w-20 text-center">有効</TableHead>
            <TableHead className="w-40 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="py-8 text-center text-muted-foreground"
              >
                種別が登録されていません。マイグレーション 00012 を適用すると、デフォルトでミーティング / その他 / 休憩 の 3 件が投入されます。
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Input
                    type="number"
                    value={row.sort_number}
                    onChange={(e) =>
                      updateLocal(row.id, {
                        sort_number: Number(e.target.value),
                      })
                    }
                    className="h-8 w-16"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.code}
                    onChange={(e) =>
                      updateLocal(row.id, { code: e.target.value })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.label}
                    onChange={(e) =>
                      updateLocal(row.id, { label: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="color"
                      value={row.color ?? "#9333ea"}
                      onChange={(e) =>
                        updateLocal(row.id, { color: e.target.value })
                      }
                      className="h-8 w-10 cursor-pointer rounded border"
                    />
                    <Input
                      value={row.color ?? ""}
                      onChange={(e) =>
                        updateLocal(row.id, { color: e.target.value })
                      }
                      className="h-8 w-20 text-xs"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="color"
                      value={row.label_text_color ?? "#ffffff"}
                      onChange={(e) =>
                        updateLocal(row.id, {
                          label_text_color: e.target.value,
                        })
                      }
                      className="h-8 w-10 cursor-pointer rounded border"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: row.color ?? "#9333ea",
                      color: row.label_text_color ?? "#ffffff",
                    }}
                  >
                    {row.label}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(v) =>
                      updateLocal(row.id, { is_active: v })
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(row)}
                      disabled={savingId === row.id}
                    >
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(row.id, row.label)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
