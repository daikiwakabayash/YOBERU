"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrand } from "../actions/createBrand";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateBrandModal({ open, onClose }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    adminLoginId: "",
    adminPassword: "",
    adminEmail: "",
  });

  if (!open) return null;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createBrand(form);
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
            <h2 className="text-lg font-bold text-gray-900">ブランドを作成</h2>
            <p className="mt-1 text-xs text-gray-500">
              ブランド名と管理者アカウントを設定します。詳細は作成後に編集できます。
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
            <Label htmlFor="brand-name">
              ブランド名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="brand-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="例: NAORU"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-code">
              企業コード <span className="text-red-500">*</span>
            </Label>
            <Input
              id="brand-code"
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="例: naoru (半角英数字 3〜64 文字)"
              required
              disabled={submitting}
            />
            <p className="text-[11px] text-gray-500">
              ログイン時に入力する企業コードです。後から変更できません。
            </p>
          </div>

          <fieldset className="space-y-3 rounded-md border bg-gray-50/40 p-3">
            <legend className="px-1 text-sm font-bold text-gray-700">
              ブランド管理者アカウント
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="admin-login-id">
                ログイン ID (メールアドレス){" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="admin-login-id"
                type="email"
                value={form.adminLoginId}
                onChange={(e) => set("adminLoginId", e.target.value)}
                placeholder="info@naoru.net"
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">
                初期パスワード <span className="text-red-500">*</span>
              </Label>
              <Input
                id="admin-password"
                type="password"
                value={form.adminPassword}
                onChange={(e) => set("adminPassword", e.target.value)}
                placeholder="8 文字以上"
                required
                minLength={8}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">
                メールアドレス (連絡用){" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="admin-email"
                type="email"
                value={form.adminEmail}
                onChange={(e) => set("adminEmail", e.target.value)}
                placeholder="admin@example.com"
                required
                disabled={submitting}
              />
            </div>
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
              {submitting ? "作成中..." : "作成する"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
