"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storeSchema, type StoreFormValues } from "../schema/store.schema";
import { FormField } from "@/components/form/FormField";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createStore, updateStore } from "../actions/storeActions";
import { useTransition, useState, useMemo } from "react";

interface StoreFormProps {
  initialData?: StoreFormValues & { id?: number };
  brandId: number;
  userId: number;
  /**
   * All brand areas available for selection. The form renders a
   * Select bound to `area_id`. Should be non-empty for a successful
   * registration — pages should fetch areas server-side.
   */
  areas?: Array<{ id: number; name: string }>;
}

const FRAME_MIN_OPTIONS = [
  { value: 5, label: "5分" },
  { value: 10, label: "10分" },
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "60分" },
] as const;

const SCALE_OPTIONS = [
  { value: 1, label: "小規模" },
  { value: 2, label: "中規模" },
  { value: 3, label: "大規模" },
] as const;

// Base UI Select の <SelectValue> はトリガーに表示する文字列を items map
// から引く。map を渡さないと数値 ID/値がそのまま表示されてしまう。
const FRAME_MIN_ITEMS: Record<string, string> = Object.fromEntries(
  FRAME_MIN_OPTIONS.map((o) => [String(o.value), o.label])
);
const SCALE_ITEMS: Record<string, string> = Object.fromEntries(
  SCALE_OPTIONS.map((o) => [String(o.value), o.label])
);

// Zod v4 z.coerce creates differing input/output types, causing a mismatch
// with react-hook-form generics. Cast the resolver to align types.
const storeResolver = zodResolver(storeSchema) as Resolver<StoreFormValues>;

export function StoreForm({
  initialData,
  brandId,
  userId,
  areas = [],
}: StoreFormProps) {
  const isEdit = !!initialData?.id;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  // 地域 Select の id → 名前 map (Base UI Select の items 要件)。
  const areaItems = useMemo(
    () => Object.fromEntries(areas.map((a) => [String(a.id), a.name])),
    [areas]
  );

  const defaultAreaId = initialData?.area_id ?? areas[0]?.id ?? 0;

  const form = useForm<StoreFormValues>({
    resolver: storeResolver,
    defaultValues: initialData ?? {
      uuid: crypto.randomUUID(),
      brand_id: brandId,
      area_id: defaultAreaId,
      user_id: userId,
      name: "",
      frame_min: 30,
      scale: 1,
      email1: "",
      email2: "",
      line_url: "",
      zip_code: "",
      address: "",
      nearest_station_access: "",
      phone_number: "",
      shop_url: "",
      is_public: true,
      sort_number: 0,
      enable_meeting_booking: true,
      logo_url: "",
      line_channel_id: "",
      line_channel_secret: "",
      line_channel_access_token: "",
      meta_ad_account_id: "",
      meta_access_token: "",
      tiktok_advertiser_id: "",
      tiktok_access_token: "",
    },
  });

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>(
    initialData?.logo_url ?? ""
  );

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !initialData?.id) return;
    setLogoUploading(true);
    try {
      const { uploadShopLogo } = await import("../actions/storeActions");
      const fd = new FormData();
      fd.set("file", file);
      fd.set("shop_id", String(initialData.id));
      const result = await uploadShopLogo(fd);
      if ("error" in result && result.error) {
        const { toast } = await import("sonner");
        toast.error(typeof result.error === "string" ? result.error : "アップロードに失敗しました");
      } else if ("logoUrl" in result && result.logoUrl) {
        setLogoPreview(result.logoUrl);
        form.setValue("logo_url", result.logoUrl);
        const { toast } = await import("sonner");
        toast.success("ロゴをアップロードしました");
      }
    } catch {
      const { toast } = await import("sonner");
      toast.error("アップロードに失敗しました");
    } finally {
      setLogoUploading(false);
    }
  }

  function onSubmit(values: StoreFormValues) {
    setServerError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.append(key, String(value ?? ""));
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateStore(initialData!.id!, formData)
        : await createStore(formData);

      if (result?.error) {
        if (typeof result.error === "string") {
          setServerError(result.error);
        } else {
          // Field-level errors from zod
          for (const [field, messages] of Object.entries(result.error)) {
            if (Array.isArray(messages) && messages.length > 0) {
              form.setError(field as keyof StoreFormValues, {
                message: messages[0],
              });
            }
          }
        }
      }
    });
  }

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
        >
          {/* Hidden fields */}
          <input type="hidden" {...form.register("uuid")} />
          <input type="hidden" {...form.register("brand_id")} />
          <input type="hidden" {...form.register("user_id")} />

          {/* 地域セレクタ */}
          {areas.length === 0 ? (
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 md:col-span-2">
              地域マスターが空です。先に地域を登録してください。
            </div>
          ) : (
            <FormField form={form} name="area_id" label="地域" required>
              {(field) => (
                <Select
                  value={String(field.value ?? "")}
                  items={areaItems}
                  onValueChange={(val) => field.onChange(Number(val))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="地域を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}

          {/* 店舗名 */}
          <FormField form={form} name="name" label="店舗名" required>
            {(field) => (
              <Input
                id="name"
                placeholder="例: 渋谷店"
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 郵便番号 */}
          <FormField form={form} name="zip_code" label="郵便番号" required>
            {(field) => (
              <Input
                id="zip_code"
                placeholder="例: 1500001"
                maxLength={7}
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 住所 */}
          <FormField
            form={form}
            name="address"
            label="住所"
            required
            className="md:col-span-2"
          >
            {(field) => (
              <Input
                id="address"
                placeholder="例: 東京都渋谷区神宮前1-2-3"
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 電話番号 */}
          <FormField
            form={form}
            name="phone_number"
            label="電話番号"
            required
          >
            {(field) => (
              <Input
                id="phone_number"
                placeholder="例: 0312345678"
                maxLength={11}
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* メールアドレス1 */}
          <FormField
            form={form}
            name="email1"
            label="メールアドレス1"
            required
          >
            {(field) => (
              <Input
                id="email1"
                type="email"
                placeholder="例: store@example.com"
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* メールアドレス2 */}
          <FormField form={form} name="email2" label="メールアドレス2">
            {(field) => (
              <Input
                id="email2"
                type="email"
                placeholder="例: store2@example.com"
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 予約枠(分) */}
          <FormField form={form} name="frame_min" label="予約枠(分)" required>
            {(field) => (
              <Select
                value={String(field.value ?? "")}
                items={FRAME_MIN_ITEMS}
                onValueChange={(val) => field.onChange(Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {FRAME_MIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          {/* 規模 */}
          <FormField form={form} name="scale" label="規模" required>
            {(field) => (
              <Select
                value={String(field.value ?? "")}
                items={SCALE_ITEMS}
                onValueChange={(val) => field.onChange(Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {SCALE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          {/* LINE URL */}
          <FormField form={form} name="line_url" label="LINE URL">
            {(field) => (
              <Input
                id="line_url"
                type="url"
                placeholder="例: https://line.me/..."
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 最寄り駅アクセス */}
          <FormField
            form={form}
            name="nearest_station_access"
            label="最寄り駅アクセス"
          >
            {(field) => (
              <Input
                id="nearest_station_access"
                placeholder="例: JR渋谷駅 徒歩5分"
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 店舗URL */}
          <FormField form={form} name="shop_url" label="店舗URL">
            {(field) => (
              <Input
                id="shop_url"
                type="url"
                placeholder="例: https://example.com"
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 表示順 */}
          <FormField form={form} name="sort_number" label="表示順">
            {(field) => (
              <Input
                id="sort_number"
                type="number"
                min={0}
                value={Number(field.value ?? 0)}
                onChange={(e) => field.onChange(Number(e.target.value))}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/* 公開設定 */}
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              checked={form.watch("is_public")}
              onCheckedChange={(checked) =>
                form.setValue("is_public", checked, { shouldValidate: true })
              }
            />
            <Label>公開する</Label>
          </div>

          {/* ミーティング / その他ボタンの表示 */}
          <div className="flex items-start gap-3 md:col-span-2">
            <Switch
              checked={form.watch("enable_meeting_booking") ?? true}
              onCheckedChange={(checked) =>
                form.setValue("enable_meeting_booking", checked, {
                  shouldValidate: true,
                })
              }
            />
            <div>
              <Label>ミーティング / その他 の予約入力を表示する</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                予約入力パネルに「ミーティング」「その他」の入力ボタンを表示します。これらは時間枠だけを抑える用途で、稼働率・売上には含まれません。
              </p>
            </div>
          </div>

          {/* 店舗ロゴ */}
          {isEdit && (
            <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/30 p-4 md:col-span-2">
              <div className="text-sm font-bold text-blue-800">
                店舗ロゴ
              </div>
              <p className="text-xs text-muted-foreground">
                公開予約フォームのヘッダーに表示されます。PNG / JPEG / WebP / SVG、2MB以内。
              </p>
              <div className="flex items-center gap-4">
                {logoPreview && (
                  <img
                    src={logoPreview}
                    alt="店舗ロゴ"
                    className="h-16 w-auto rounded border object-contain"
                  />
                )}
                <label className="cursor-pointer rounded-md border bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
                  {logoUploading ? "アップロード中..." : logoPreview ? "ロゴを変更" : "ロゴをアップロード"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                </label>
              </div>
            </div>
          )}

          {/* LINE Messaging API 連携 */}
          <div className="space-y-3 rounded-lg border border-green-100 bg-green-50/30 p-4 md:col-span-2">
            <div className="text-sm font-bold text-green-800">
              LINE Messaging API 連携
            </div>
            <p className="text-xs text-muted-foreground">
              LINE Developers Console から取得した値を入力してください。設定後、Webhook URL に{" "}
              <code className="rounded bg-gray-100 px-1 text-[11px]">
                https://お客様のドメイン/api/line/webhook
              </code>{" "}
              を登録すると、友だち追加 → リマインド通知が有効になります。
            </p>
            <div className="grid grid-cols-1 gap-3">
              <FormField form={form} name="line_channel_id" label="チャネル ID (Bot の User ID)">
                {(field) => (
                  <Input
                    id="line_channel_id"
                    placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
              <FormField form={form} name="line_channel_secret" label="チャネルシークレット">
                {(field) => (
                  <Input
                    id="line_channel_secret"
                    type="password"
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
              <FormField form={form} name="line_channel_access_token" label="チャネルアクセストークン (長期)">
                {(field) => (
                  <Input
                    id="line_channel_access_token"
                    type="password"
                    placeholder="長期トークンをここに貼り付け"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
            </div>
          </div>

          {/* 広告 API 連携 (Meta / TikTok) */}
          <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/30 p-4 md:col-span-2">
            <div className="text-sm font-bold text-blue-800">
              広告 API 連携 (Meta / TikTok)
            </div>
            <p className="text-xs text-muted-foreground">
              入力すると 30 分ごとに広告費・Impression・CTR・CVR・CPM・クリック数を
              自動取得し、マーケティングダッシュボードに反映します。詳しい取得手順は{" "}
              <code className="rounded bg-gray-100 px-1 text-[11px]">
                docs/ad-api-integration.md
              </code>{" "}
              を参照してください。
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField form={form} name="meta_ad_account_id" label="Meta 広告アカウント ID">
                {(field) => (
                  <Input
                    id="meta_ad_account_id"
                    placeholder="act_1234567890"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
              <FormField form={form} name="meta_access_token" label="Meta アクセストークン (長期)">
                {(field) => (
                  <Input
                    id="meta_access_token"
                    type="password"
                    placeholder="EAA... (システムユーザートークン)"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
              <FormField form={form} name="tiktok_advertiser_id" label="TikTok 広告主 ID (advertiser_id)">
                {(field) => (
                  <Input
                    id="tiktok_advertiser_id"
                    placeholder="例: 6925..."
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
              <FormField form={form} name="tiktok_access_token" label="TikTok アクセストークン (長期)">
                {(field) => (
                  <Input
                    id="tiktok_access_token"
                    type="password"
                    placeholder="長期トークンをここに貼り付け"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
            </div>
            <p className="text-[11px] text-blue-700">
              ※ 入力したトークンは平文で DB に保存されます。本番運用では Supabase Vault や
              Vercel 環境変数経由での管理を推奨。
            </p>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive md:col-span-2">
              {serverError}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 md:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "保存中..."
                : isEdit
                  ? "更新する"
                  : "登録する"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
