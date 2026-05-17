"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { CreativeSymptom } from "../types";
import {
  createCreativeSymptom,
  updateCreativeSymptom,
  deleteCreativeSymptom,
} from "../actions/creativeSymptomActions";

interface CreativeSymptomListProps {
  symptoms: CreativeSymptom[];
}

export function CreativeSymptomList({
  symptoms: initial,
}: CreativeSymptomListProps) {
  const [rows, setRows] = useState(initial);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  function updateLocal(code: string, patch: Partial<CreativeSymptom>) {
    setRows((prev) =>
      prev.map((r) => (r.code === code ? { ...r, ...patch } : r))
    );
  }

  async function handleSave(row: CreativeSymptom) {
    setSavingCode(row.code);
    const form = new FormData();
    form.set("name", row.name);
    form.set("sort_number", String(row.sort_number));
    const result = await updateCreativeSymptom(row.code, form);
    setSavingCode(null);
    if (result.error) {
      toast.error(`更新に失敗しました: ${result.error}`, { duration: 8000 });
    } else {
      toast.success("更新しました");
    }
  }

  async function handleAdd() {
    const form = new FormData();
    form.set("name", "新規症状");
    form.set("sort_number", String(rows.length + 1));
    const result = await createCreativeSymptom(form);
    if (result.error) {
      toast.error(`追加に失敗しました: ${result.error}`, { duration: 8000 });
    } else {
      toast.success("追加しました");
      location.reload();
    }
  }

  async function handleDelete(code: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const result = await deleteCreativeSymptom(code);
    if (result.error) {
      toast.error(`削除に失敗しました: ${result.error}`, { duration: 8000 });
    } else {
      setRows((prev) => prev.filter((r) => r.code !== code));
      toast.success("削除しました");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        ※ 強制リンク作成画面の「症状」プルダウン、およびマーケティング
        →クリエイティブ分析タブの行ラベルで使われます。
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
            <TableHead>症状名</TableHead>
            <TableHead className="w-40 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-8 text-center text-muted-foreground"
              >
                症状が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.code}>
                <TableCell>
                  <Input
                    type="number"
                    value={row.sort_number}
                    onChange={(e) =>
                      updateLocal(row.code, {
                        sort_number: Number(e.target.value),
                      })
                    }
                    className="h-8 w-16"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.name}
                    onChange={(e) =>
                      updateLocal(row.code, { name: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(row)}
                      disabled={savingCode === row.code}
                    >
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(row.code, row.name)}
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
