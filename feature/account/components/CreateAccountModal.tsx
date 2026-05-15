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
import { createAccount } from "../actions/accountActions";
import type { BrandOption } from "../services/getAccounts";
import type { PermissionType } from "../schema/accountSchema";

interface Props {
  open: boolean;
  onClose: () => void;
  brands: BrandOption[];
}

export function CreateAccountModal({ open, onClose, brands }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    loginId: string;
    password: string;
    name: string;
    permissionType: PermissionType;
    brandId: number | null;
  }>({
    loginId: "",
    password: "",
    name: "",
    permissionType: "limited",
    brandId: brands[0]?.id ?? null,
  });

  const brandItems = useMemo(
    () => Object.fromEntries(brands.map((b) => [String(b.id), b.name])),
    [brands]
  );

  if (!open) return null;

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createAccount({
      loginId: form.loginId,
      password: form.password,
      name: form.name,
      permissionType: form.permissionType,
      brandId: form.permissionType === "root" ? null : form.brandId,
    });
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
              アカウントを発行
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              スタッフ用のログイン ID とパスワードを発行し、権限を割り当てます。
            </p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">
              氏名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="account-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="例: 山田 太郎"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-login">
              ログイン ID (メールアドレス) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="account-login"
              type="email"
              value={form.loginId}
              onChange={(e) => set("loginId", e.target.value)}
              placeholder="staff@example.com"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-password">
              初期パスワード <span className="text-red-500">*</span>
            </Label>
            <Input
              id="account-password"
              type="text"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="8 文字以上"
              required
              minLength={8}
              disabled={submitting}
            />
            <p className="text-[11px] text-gray-500">
              本人にこのパスワードを共有してください。後で「パスワードリセット」から再発行できます。
            </p>
          </div>

          <fieldset className="space-y-3 rounded-md border bg-gray-50/40 p-3">
            <legend className="px-1 text-sm font-bold text-gray-700">
              権限設定
            </legend>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-white p-3 hover:border-blue-300">
                <input
                  type="radio"
                  name="permission"
                  value="root"
                  checked={form.permissionType === "root"}
                  onChange={() => set("permissionType", "root")}
                  disabled={submitting}
                  className="mt-1"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900">
                    ルート権限
                  </div>
                  <div className="text-[11px] text-gray-500">
                    全ブランドを管理できる権限。両ブランドの予約・顧客・売上などすべてに横断的にアクセス可能。
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-white p-3 hover:border-blue-300">
                <input
                  type="radio"
                  name="permission"
                  value="limited"
                  checked={form.permissionType === "limited"}
                  onChange={() => set("permissionType", "limited")}
                  disabled={submitting}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-gray-900">
                    限定権限
                  </div>
                  <div className="text-[11px] text-gray-500">
                    1 ブランドだけにアクセスできる権限。下で対象ブランドを選択。
                  </div>
                </div>
              </label>
            </div>

            {form.permissionType === "limited" && (
              <div className="space-y-1.5">
                <Label htmlFor="account-brand">
                  対象ブランド <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.brandId != null ? String(form.brandId) : ""}
                  items={brandItems}
                  onValueChange={(v) =>
                    set("brandId", v ? Number(v) : null)
                  }
                  disabled={submitting}
                >
                  <SelectTrigger id="account-brand" className="h-9 bg-white">
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

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "作成中..." : "発行する"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
