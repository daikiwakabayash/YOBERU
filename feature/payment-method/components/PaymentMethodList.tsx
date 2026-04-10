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
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethod } from "../types";
import {
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from "../actions/paymentMethodActions";

interface PaymentMethodListProps {
  methods: PaymentMethod[];
  shopId: number;
  brandId: number;
}

export function PaymentMethodList({
  methods: initial,
  shopId,
  brandId,
}: PaymentMethodListProps) {
  const [methods, setMethods] = useState(initial);
  const [saving, setSaving] = useState(false);

  function updateLocal(id: number, patch: Partial<PaymentMethod>) {
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function handleSave(m: PaymentMethod) {
    setSaving(true);
    const form = new FormData();
    form.set("brand_id", String(brandId));
    form.set("shop_id", String(shopId));
    form.set("code", m.code);
    form.set("name", m.name);
    form.set("sort_number", String(m.sort_number));
    form.set("is_active", m.is_active ? "true" : "false");
    const result = await updatePaymentMethod(m.id, form);
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error("更新に失敗しました");
    } else {
      toast.success("更新しました");
    }
  }

  async function handleAdd() {
    setSaving(true);
    const form = new FormData();
    form.set("brand_id", String(brandId));
    form.set("shop_id", String(shopId));
    form.set("code", `method_${Date.now()}`);
    form.set("name", "新規支払方法");
    form.set("sort_number", String(methods.length + 1));
    form.set("is_active", "true");
    const result = await createPaymentMethod(form);
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error("追加に失敗しました");
    } else {
      toast.success("追加しました");
      location.reload();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("削除しますか？")) return;
    const result = await deletePaymentMethod(id);
    if ("error" in result && result.error) {
      toast.error("削除に失敗しました");
    } else {
      setMethods((prev) => prev.filter((m) => m.id !== id));
      toast.success("削除しました");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAdd} disabled={saving}>
          <Plus className="mr-1 h-4 w-4" />
          追加する
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">並び順</TableHead>
            <TableHead>コード</TableHead>
            <TableHead>表示名</TableHead>
            <TableHead className="w-24 text-center">有効</TableHead>
            <TableHead className="w-48 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {methods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                支払方法が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            methods.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Input
                    type="number"
                    value={m.sort_number}
                    onChange={(e) =>
                      updateLocal(m.id, { sort_number: Number(e.target.value) })
                    }
                    className="w-16"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={m.code}
                    onChange={(e) => updateLocal(m.id, { code: e.target.value })}
                    className="w-32 font-mono text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={m.name}
                    onChange={(e) => updateLocal(m.id, { name: e.target.value })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={m.is_active}
                    onCheckedChange={(v) => updateLocal(m.id, { is_active: v })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" onClick={() => handleSave(m)} disabled={saving}>
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(m.id)}
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
      <p className="text-xs text-muted-foreground">
        ※ コードは会計データと紐づきます。変更時は既存の予約データに影響しないよう注意してください。
      </p>
    </div>
  );
}
