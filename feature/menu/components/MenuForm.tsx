"use client";

import { useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { menuSchema, type MenuFormValues } from "../schema/menu.schema";
import { createMenu, updateMenu } from "../actions/menuActions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CategoryOption {
  id: number;
  name: string;
}

interface MenuFormProps {
  brandId: number;
  categories: CategoryOption[];
  initialData?: MenuFormValues & { id: number };
}

// Base UI Select は <SelectValue> が `value` 文字列をそのまま表示するため、
// `items` プロップ (value → label の map) を渡さないとトリガーに数字 ID が
// 出てしまう。ハードコード選択肢の map をモジュールトップで定義する。
const MENU_TYPE_ITEMS: Record<string, string> = {
  "0": "ブランド共通",
  "1": "店舗限定",
};

// プラン区分 (menus.plan_type)。通常のメニュー (施術) は「なし」、
// 回数券と月額サブスクは AppointmentDetailSheet のプラン提案カードに
// 自動的に並ぶ。
const PLAN_TYPE_ITEMS: Record<string, string> = {
  none: "なし (通常メニュー)",
  ticket: "チケット (回数券)",
  subscription: "サブスクリプション (月額)",
};

export function MenuForm({ brandId, categories, initialData }: MenuFormProps) {
  const isEdit = !!initialData;

  // カテゴリ Select 用の items map (id → 名前)。categories は親から渡る
  // 配列なので useMemo でキャッシュする。
  const categoryItems = useMemo(
    () => Object.fromEntries(categories.map((c) => [String(c.id), c.name])),
    [categories]
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MenuFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(menuSchema) as any,
    defaultValues: {
      brand_id: brandId,
      shop_id: initialData?.shop_id ?? null,
      category_id: initialData?.category_id ?? (undefined as unknown as number),
      menu_type: initialData?.menu_type ?? 0,
      name: initialData?.name ?? "",
      price: initialData?.price ?? 0,
      price_disp_type: initialData?.price_disp_type ?? false,
      duration: initialData?.duration ?? (undefined as unknown as number),
      image_url: initialData?.image_url ?? "",
      available_count: initialData?.available_count ?? undefined,
      status: initialData?.status ?? true,
      sort_number: initialData?.sort_number ?? 0,
      plan_type: initialData?.plan_type ?? null,
      ticket_count: initialData?.ticket_count ?? null,
    },
  });

  const onSubmit = async (values: MenuFormValues) => {
    const formData = new FormData();
    formData.append("brand_id", String(values.brand_id));
    if (values.shop_id) formData.append("shop_id", String(values.shop_id));
    formData.append("category_id", String(values.category_id));
    formData.append("menu_type", String(values.menu_type));
    formData.append("name", values.name);
    formData.append("price", String(values.price));
    formData.append("price_disp_type", String(values.price_disp_type));
    formData.append("duration", String(values.duration));
    if (values.image_url) formData.append("image_url", values.image_url);
    if (values.available_count !== undefined) {
      formData.append("available_count", String(values.available_count));
    }
    formData.append("status", String(values.status));
    formData.append("sort_number", String(values.sort_number));
    // plan_type: "" を送ると "通常メニュー" として扱う (null 相当)。
    // zod 側の preprocess で "" / null → null に落ちるので、空文字で送る。
    formData.append("plan_type", values.plan_type ?? "");
    if (values.ticket_count != null) {
      formData.append("ticket_count", String(values.ticket_count));
    }

    if (isEdit && initialData) {
      await updateMenu(initialData.id, formData);
    } else {
      await createMenu(formData);
    }
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{isEdit ? "メニュー編集" : "メニュー登録"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            type="hidden"
            {...register("brand_id", { valueAsNumber: true })}
          />

          {/* カテゴリ */}
          <div className="space-y-1.5">
            <Label htmlFor="category_id">メニューカテゴリ</Label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select
                  value={field.value != null ? String(field.value) : undefined}
                  items={categoryItems}
                  onValueChange={(val) => field.onChange(Number(val))}
                >
                  <SelectTrigger className="w-full" id="category_id">
                    <SelectValue placeholder="カテゴリを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category_id && (
              <p className="text-xs text-destructive">
                {errors.category_id.message}
              </p>
            )}
          </div>

          {/* メニュータイプ */}
          <div className="space-y-1.5">
            <Label htmlFor="menu_type">メニュータイプ</Label>
            <Controller
              control={control}
              name="menu_type"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  items={MENU_TYPE_ITEMS}
                  onValueChange={(val) => field.onChange(Number(val))}
                >
                  <SelectTrigger className="w-full" id="menu_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">ブランド共通</SelectItem>
                    <SelectItem value="1">店舗限定</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* メニュー名 */}
          <div className="space-y-1.5">
            <Label htmlFor="name">メニュー名</Label>
            <Input id="name" placeholder="例: カット" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* 料金 */}
          <div className="space-y-1.5">
            <Label htmlFor="price">料金 (円)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              {...register("price", { valueAsNumber: true })}
            />
            {errors.price && (
              <p className="text-xs text-destructive">{errors.price.message}</p>
            )}
          </div>

          {/* 料金表示 */}
          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="price_disp_type"
              render={({ field }) => (
                <Switch
                  id="price_disp_type"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="price_disp_type">料金を表示する</Label>
          </div>

          {/* 施術時間 */}
          <div className="space-y-1.5">
            <Label htmlFor="duration">施術時間 (分)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              placeholder="例: 60"
              {...register("duration", { valueAsNumber: true })}
            />
            {errors.duration && (
              <p className="text-xs text-destructive">
                {errors.duration.message}
              </p>
            )}
          </div>

          {/* 画像URL */}
          <div className="space-y-1.5">
            <Label htmlFor="image_url">画像URL</Label>
            <Input
              id="image_url"
              placeholder="https://..."
              {...register("image_url")}
            />
          </div>

          {/* 同時受付数 */}
          <div className="space-y-1.5">
            <Label htmlFor="available_count">同時受付数</Label>
            <Input
              id="available_count"
              type="number"
              min={0}
              {...register("available_count", { valueAsNumber: true })}
            />
          </div>

          {/* プラン区分 (回数券 / サブスク / 通常) */}
          <div className="space-y-1.5">
            <Label htmlFor="plan_type">プラン区分</Label>
            <Controller
              control={control}
              name="plan_type"
              render={({ field }) => (
                <Select
                  value={field.value ?? "none"}
                  items={PLAN_TYPE_ITEMS}
                  onValueChange={(val) =>
                    field.onChange(val === "none" ? null : val)
                  }
                >
                  <SelectTrigger className="w-full" id="plan_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし (通常メニュー)</SelectItem>
                    <SelectItem value="ticket">チケット (回数券)</SelectItem>
                    <SelectItem value="subscription">
                      サブスクリプション (月額)
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-[11px] text-gray-500">
              チケット / サブスクを選ぶと、予約シートの「プラン提案」カードに
              自動で表示され、購入すると顧客の残数管理に反映されます。
            </p>
          </div>

          {/* 回数入力: ticket / subscription の両方で表示する。
              - ticket    → 購入時点の総回数 (customer_plans.total_count)
              - subscription → 1 ヶ月あたりの利用可能回数 (空欄なら無制限)
              どちらも menus.ticket_count に保存する (DB CHECK は 00020 で
              "ticket のとき必須 / それ以外は任意" を許容している)。 */}
          <Controller
            control={control}
            name="plan_type"
            render={({ field: planTypeField }) =>
              planTypeField.value === "ticket" ||
              planTypeField.value === "subscription" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ticket_count">
                    {planTypeField.value === "ticket"
                      ? "回数 (回数券の総回数)"
                      : "月あたりの回数 (空欄で無制限)"}
                  </Label>
                  <Input
                    id="ticket_count"
                    type="number"
                    min={1}
                    placeholder={
                      planTypeField.value === "ticket"
                        ? "例: 4 (4 回券)"
                        : "例: 4 (月 4 回まで)"
                    }
                    {...register("ticket_count", { valueAsNumber: true })}
                  />
                  {errors.ticket_count && (
                    <p className="text-xs text-destructive">
                      {errors.ticket_count.message}
                    </p>
                  )}
                </div>
              ) : (
                <></>
              )
            }
          />

          {/* 公開状態 */}
          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Switch
                  id="status"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="status">
              {/* Display label based on current value via CSS is not trivial,
                  so we just show a static label. Actual state is reflected by the switch. */}
              公開
            </Label>
          </div>

          {/* 表示順 */}
          <div className="space-y-1.5">
            <Label htmlFor="sort_number">表示順</Label>
            <Input
              id="sort_number"
              type="number"
              min={0}
              {...register("sort_number", { valueAsNumber: true })}
            />
            {errors.sort_number && (
              <p className="text-xs text-destructive">
                {errors.sort_number.message}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : isEdit ? "更新" : "登録"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => history.back()}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
