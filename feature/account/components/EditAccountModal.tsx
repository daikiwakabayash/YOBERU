"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import {
  updateAccount,
  resetPassword,
  deleteAccount,
} from "../actions/accountActions";
import type { AccountRow, BrandOption } from "../services/getAccounts";
import type { PermissionType } from "../schema/accountSchema";

interface Props {
  open: boolean;
  onClose: () => void;
  account: AccountRow;
  brands: BrandOption[];
}

export function EditAccountModal({ open, onClose, account, brands }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    permissionType: PermissionType;
    brandId: number | null;
  }>({
    name: account.name ?? "",
    permissionType: account.permissionType,
    brandId: account.brandId ?? brands[0]?.id ?? null,
  });
  const [newPassword, setNewPassword] = useState("");

  const brandItems = useMemo(
    () => Object.fromEntries(brands.map((b) => [String(b.id), b.name])),
    [brands]
  );

  if (!open) return null;

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const result = await updateAccount({
      id: account.id,
      name: form.name,
      permissionType: form.permissionType,
      brandId: form.permissionType === "root" ? null : form.brandId,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo("更新しました");
    router.refresh();
  }

  async function handleResetPassword() {
    if (newPassword.length < 8) {
      setError("パスワードは 8 文字以上にしてください");
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const result = await resetPassword({
      id: account.id,
      newPassword,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo(`新しいパスワードを設定しました: ${newPassword}`);
    setNewPassword("");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`「${account.email}」を完全に削除します。よろしいですか?`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const result = await deleteAccount(account.id);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              アカウントを編集
            </h2>
            <p className="mt-1 text-xs text-gray-500">{account.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
            disabled={submitting}
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">氏名</Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              disabled={submitting}
            />
          </div>

          <fieldset className="space-y-3 rounded-md border bg-gray-50/40 p-3">
            <legend className="px-1 text-sm font-bold text-gray-700">
              権限設定
            </legend>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-white p-3 hover:border-blue-300">
                <input
                  type="radio"
                  name="edit-permission"
                  checked={form.permissionType === "root"}
                  onChange={() =>
                    setForm((f) => ({ ...f, permissionType: "root" }))
                  }
                  disabled={submitting}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    ルート権限
                  </div>
                  <div className="text-[11px] text-gray-500">
                    全ブランドを管理できる
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-white p-3 hover:border-blue-300">
                <input
                  type="radio"
                  name="edit-permission"
                  checked={form.permissionType === "limited"}
                  onChange={() =>
                    setForm((f) => ({ ...f, permissionType: "limited" }))
                  }
                  disabled={submitting}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-bold text-gray-900">
                    限定権限
                  </div>
                  <div className="text-[11px] text-gray-500">
                    1 ブランドだけにアクセス
                  </div>
                </div>
              </label>
            </div>

            {form.permissionType === "limited" && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-brand">対象ブランド</Label>
                <Select
                  value={form.brandId != null ? String(form.brandId) : ""}
                  items={brandItems}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      brandId: v ? Number(v) : null,
                    }))
                  }
                  disabled={submitting}
                >
                  <SelectTrigger id="edit-brand" className="h-9 bg-white">
                    <SelectValue placeholder="ブランドを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </fieldset>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "更新中..." : "更新する"}
            </Button>
          </div>
        </form>

        <fieldset className="mt-6 space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
          <legend className="px-1 text-sm font-bold text-amber-700">
            パスワード再発行
          </legend>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-password">新しいパスワード</Label>
              <Input
                id="new-password"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8 文字以上"
                disabled={submitting}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetPassword}
              disabled={submitting || newPassword.length < 8}
            >
              リセット
            </Button>
          </div>
        </fieldset>

        <fieldset className="mt-6 space-y-3 rounded-md border border-red-200 bg-red-50/40 p-3">
          <legend className="px-1 text-sm font-bold text-red-700">
            アカウント削除
          </legend>
          <p className="text-[11px] text-red-700">
            このアカウントの認証情報と users レコードを完全に削除します。元に戻せません。
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={submitting}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              削除する
            </Button>
          </div>
        </fieldset>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {info}
          </div>
        )}
      </div>
    </div>
  );
}
