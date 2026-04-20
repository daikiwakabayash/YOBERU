"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { BookingLink } from "../types";
import {
  createBookingLink,
  updateBookingLink,
} from "../actions/bookingLinkActions";
import { ReminderSettingsSection } from "./ReminderSettingsSection";

interface BookingLinkFormProps {
  brandId: number;
  shops: Array<{ id: number; name: string }>;
  menus: Array<{
    menu_manage_id: string;
    name: string;
    price: number;
    duration: number;
    category_name?: string | null;
  }>;
  visitSources: Array<{ id: number; name: string }>;
  tagTemplates: Array<{ id: number; title: string }>;
  initialData?: BookingLink;
}

export function BookingLinkForm({
  brandId,
  shops,
  menus,
  visitSources,
  tagTemplates,
  initialData,
}: BookingLinkFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [memo, setMemo] = useState(initialData?.memo ?? "");
  const [language, setLanguage] = useState(initialData?.language ?? "ja");
  const [selectedShopIds, setSelectedShopIds] = useState<number[]>(
    initialData?.shop_ids && initialData.shop_ids.length > 0
      ? initialData.shop_ids
      : initialData?.shop_id
        ? [initialData.shop_id]
        : []
  );
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>(
    initialData?.menu_manage_ids ?? []
  );
  const [aliasMenuName, setAliasMenuName] = useState(
    initialData?.alias_menu_name ?? ""
  );
  const [staffMode, setStaffMode] = useState(initialData?.staff_mode ?? 0);
  const [requireCancelPolicy, setRequireCancelPolicy] = useState(
    initialData?.require_cancel_policy ?? true
  );
  const [cancelPolicyText, setCancelPolicyText] = useState(
    initialData?.cancel_policy_text ?? ""
  );
  const [showLineButton, setShowLineButton] = useState(
    initialData?.show_line_button ?? false
  );
  const [lineButtonText, setLineButtonText] = useState(
    initialData?.line_button_text ?? ""
  );
  const [lineButtonUrl, setLineButtonUrl] = useState(
    initialData?.line_button_url ?? ""
  );
  const [visitSourceId, setVisitSourceId] = useState<number | null>(
    initialData?.visit_source_id ?? null
  );
  const [headTagTemplateId, setHeadTagTemplateId] = useState<number | null>(
    initialData?.head_tag_template_id ?? null
  );
  const [bodyTagTemplateId, setBodyTagTemplateId] = useState<number | null>(
    initialData?.body_tag_template_id ?? null
  );
  const [immediateEmailEnabled, setImmediateEmailEnabled] = useState<boolean>(
    initialData?.immediate_email_enabled ?? true
  );
  const [immediateEmailSubject, setImmediateEmailSubject] = useState<string>(
    initialData?.immediate_email_subject ?? ""
  );
  const [immediateEmailTemplate, setImmediateEmailTemplate] = useState<string>(
    initialData?.immediate_email_template ?? ""
  );
  const [reminderSettings, setReminderSettings] = useState<
    import("../types").ReminderSetting[]
  >(initialData?.reminder_settings ?? []);
  const [saving, setSaving] = useState(false);

  // Group menus by category
  const menusByCategory = menus.reduce<Record<string, typeof menus>>(
    (acc, m) => {
      const key = m.category_name ?? "その他";
      (acc[key] ??= []).push(m);
      return acc;
    },
    {}
  );

  function toggleMenu(id: string) {
    setSelectedMenuIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleShop(id: number) {
    setSelectedShopIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (!slug.trim() || !title.trim()) {
      toast.error("タイトルとURLスラッグを入力してください");
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.set("brand_id", String(brandId));
    // Legacy shop_id: keep first selected shop for backward compatibility
    // (the public route falls back to this if shop_ids is empty).
    if (selectedShopIds.length > 0) {
      form.set("shop_id", String(selectedShopIds[0]));
    }
    form.set("shop_ids", JSON.stringify(selectedShopIds));
    form.set("slug", slug.trim());
    form.set("title", title.trim());
    form.set("memo", memo);
    form.set("language", language);
    form.set("menu_manage_ids", JSON.stringify(selectedMenuIds));
    form.set("alias_menu_name", aliasMenuName);
    form.set("staff_mode", String(staffMode));
    form.set("require_cancel_policy", requireCancelPolicy ? "true" : "false");
    form.set("cancel_policy_text", cancelPolicyText);
    form.set("show_line_button", showLineButton ? "true" : "false");
    form.set("line_button_text", lineButtonText);
    form.set("line_button_url", lineButtonUrl);
    if (visitSourceId) form.set("visit_source_id", String(visitSourceId));
    if (headTagTemplateId)
      form.set("head_tag_template_id", String(headTagTemplateId));
    if (bodyTagTemplateId)
      form.set("body_tag_template_id", String(bodyTagTemplateId));
    form.set(
      "immediate_email_enabled",
      immediateEmailEnabled ? "true" : "false"
    );
    form.set("immediate_email_subject", immediateEmailSubject);
    form.set("immediate_email_template", immediateEmailTemplate);
    form.set("reminder_settings", JSON.stringify(reminderSettings));

    const result = isEdit
      ? await updateBookingLink(initialData!.id, form)
      : await createBookingLink(form);

    setSaving(false);
    if ("error" in result && result.error) {
      const errStr =
        typeof result.error === "string"
          ? result.error
          : JSON.stringify(result.error);
      if (
        errStr.includes("does not exist") ||
        errStr.includes("schema cache") ||
        errStr.includes("booking_links")
      ) {
        toast.error(
          "データベースのセットアップが必要です。一覧画面から案内に従ってSQLを実行してください。",
          { duration: 8000 }
        );
      } else if (errStr.includes("duplicate") || errStr.includes("unique")) {
        toast.error("このURLスラッグはすでに使用されています");
      } else {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "保存に失敗しました（入力を確認してください）"
        );
      }
      return;
    }
    toast.success(isEdit ? "更新しました" : "作成しました");
    router.push("/booking-link");
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/book/${slug || "<slug>"}`
      : `/book/${slug || "<slug>"}`;

  return (
    <div className="space-y-6">
      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>言語指定</Label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-9 w-48 rounded-md border px-2 text-sm"
            >
              <option value="ja">日本語/Japanese</option>
              <option value="en">英語/English</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>
              タイトル <span className="text-red-500">(必須)</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 東京①：META 肩こり¥2000"
            />
          </div>
          <div className="space-y-2">
            <Label>
              URLスラッグ <span className="text-red-500">(必須)</span>
            </Label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">/book/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="tokyo1.meta.katakori"
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              使用可能な文字: a-z, 0-9, ., _, -
            </p>
            <p className="text-xs text-muted-foreground">
              公開URL: <code>{publicUrl}</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label>メモ</Label>
            <Textarea
              value={memo ?? ""}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="管理メモ"
            />
          </div>
        </CardContent>
      </Card>

      {/* Shop selection (multi) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">対象店舗</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            このリンクで予約を受け付ける店舗を選択してください。複数選択
            すると、お客様は予約フォーム上で店舗を選べるようになります。
            未選択の場合はブランド配下の全店舗が対象になります。
          </p>
          {shops.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              店舗が登録されていません。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shops.map((s) => {
                const selected = selectedShopIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleShop(s.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="text-[11px] text-gray-400">
            選択中:{" "}
            {selectedShopIds.length === 0
              ? "全店舗 (ブランド配下)"
              : `${selectedShopIds.length}店舗`}
          </div>
        </CardContent>
      </Card>

      {/* Menu selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">メニュー選択（1つ以上）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(menusByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              メニューが登録されていません。
            </p>
          ) : (
            Object.entries(menusByCategory).map(([category, items]) => (
              <div key={category} className="space-y-2">
                <div className="text-sm font-bold">{category}</div>
                <div className="flex flex-wrap gap-2">
                  {items.map((m) => {
                    const selected = selectedMenuIds.includes(m.menu_manage_id);
                    return (
                      <button
                        key={m.menu_manage_id}
                        type="button"
                        onClick={() => toggleMenu(m.menu_manage_id)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {m.name} ({m.duration}分) ¥{m.price.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {selectedMenuIds.length === 1 && (
            <div className="space-y-2">
              <Label>メニュー別名（任意）</Label>
              <Input
                value={aliasMenuName ?? ""}
                onChange={(e) => setAliasMenuName(e.target.value)}
                placeholder="メニュー名を変えたい場合のみ入力"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">スタッフ指名</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { value: 0, label: "スタッフ指名が可能な予約" },
            { value: 1, label: "スタッフ指名又はお任せ選択が可能な予約" },
            { value: 2, label: "スタッフ指名不可（お任せのみ）の予約" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="staff_mode"
                checked={staffMode === opt.value}
                onChange={() => setStaffMode(opt.value)}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Cancel policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">キャンセルポリシー確認</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <Switch
              checked={requireCancelPolicy}
              onCheckedChange={setRequireCancelPolicy}
            />
            <span className="text-sm">
              {requireCancelPolicy ? "必要" : "不要"}
            </span>
          </label>
          {requireCancelPolicy && (
            <div className="space-y-2">
              <Label>文章</Label>
              <Textarea
                value={cancelPolicyText ?? ""}
                onChange={(e) => setCancelPolicyText(e.target.value)}
                rows={3}
                placeholder="例: 予約の2時間前までにご連絡ください..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* LINE button */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LINEボタン追加</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <Switch checked={showLineButton} onCheckedChange={setShowLineButton} />
            <span className="text-sm">{showLineButton ? "必要" : "不要"}</span>
          </label>
          {showLineButton && (
            <>
              <div className="space-y-2">
                <Label>ボタン文言</Label>
                <Input
                  value={lineButtonText ?? ""}
                  onChange={(e) => setLineButtonText(e.target.value)}
                  placeholder="LINEで相談する"
                />
              </div>
              <div className="space-y-2">
                <Label>LINE URL</Label>
                <Input
                  value={lineButtonUrl ?? ""}
                  onChange={(e) => setLineButtonUrl(e.target.value)}
                  placeholder="https://line.me/..."
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Visit source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">媒体選択（来店経路）</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={visitSourceId ?? ""}
            onChange={(e) =>
              setVisitSourceId(e.target.value ? Number(e.target.value) : null)
            }
            className="h-9 w-64 rounded-md border px-2 text-sm"
          >
            <option value="">— 媒体なし —</option>
            {visitSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            このリンクから予約した顧客はこの媒体で自動タグ付けされます。
          </p>
        </CardContent>
      </Card>

      {/* Tag templates (GTM 等) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">タグテンプレート</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            このリンクの公開ページ (/book/&lt;slug&gt;) に Google タグマネージャー等を
            埋め込む場合、事前に作成した「タグテンプレート」を選択してください。
            新規作成・編集は
            <a
              href="/tag-template"
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 text-blue-600 underline"
            >
              タグテンプレート
            </a>
            ページから行えます。
          </p>
          <div className="space-y-2">
            <Label>head に埋め込むタグ</Label>
            <select
              value={headTagTemplateId ?? ""}
              onChange={(e) =>
                setHeadTagTemplateId(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className="h-9 w-full max-w-md rounded-md border px-2 text-sm"
            >
              <option value="">— なし —</option>
              {tagTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>body 直下に埋め込むタグ</Label>
            <select
              value={bodyTagTemplateId ?? ""}
              onChange={(e) =>
                setBodyTagTemplateId(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className="h-9 w-full max-w-md rounded-md border px-2 text-sm"
            >
              <option value="">— なし —</option>
              {tagTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Immediate confirmation email (sent right after booking) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">予約完了時の即時メール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            予約が入った瞬間に、お客様のメールアドレスへ確認メールを送ります。
            件名と本文を空欄にすると、既定のテンプレート (店舗名・日時・
            メニュー・担当 を含む丁寧な日本語文) が使われます。
            使用可能な差し込み変数:{" "}
            <code className="text-[11px]">
              {"{customer_name} {shop_name} {date} {time} {menu} {staff}"}
            </code>
          </p>
          <label className="flex items-center gap-2">
            <Switch
              checked={immediateEmailEnabled}
              onCheckedChange={setImmediateEmailEnabled}
            />
            <span className="text-sm">
              {immediateEmailEnabled ? "送信する" : "送信しない"}
            </span>
          </label>
          {immediateEmailEnabled && (
            <>
              <div className="space-y-2">
                <Label>件名 (空欄でデフォルト)</Label>
                <Input
                  value={immediateEmailSubject}
                  onChange={(e) => setImmediateEmailSubject(e.target.value)}
                  placeholder="【{shop_name}】ご予約ありがとうございます"
                />
              </div>
              <div className="space-y-2">
                <Label>本文 (空欄でデフォルト)</Label>
                <Textarea
                  value={immediateEmailTemplate}
                  onChange={(e) => setImmediateEmailTemplate(e.target.value)}
                  rows={8}
                  placeholder={`{customer_name} 様\n\nこの度は {shop_name} をご予約いただき...`}
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reminder settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">リマインド設定</CardTitle>
        </CardHeader>
        <CardContent>
          <ReminderSettingsSection
            value={reminderSettings}
            onChange={setReminderSettings}
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "保存中..." : isEdit ? "更新する" : "作成する"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/booking-link")}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
