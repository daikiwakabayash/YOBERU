"use client";

import { useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  staffSchema,
  type StaffFormValues,
} from "../schema/staff.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStaff, updateStaff } from "../actions/staffActions";
import { toast } from "sonner";

export interface WorkPattern {
  id: number;
  name: string;
  abbreviation_name: string | null;
  start_time: string;
  end_time: string;
}

interface StaffFormProps {
  brandId: number;
  shopId: number;
  workPatterns: WorkPattern[];
  initialData?: StaffFormValues & { id: number };
}

const SHIFT_FIELDS = [
  { key: "shift_monday" as const, label: "月曜日" },
  { key: "shift_tuesday" as const, label: "火曜日" },
  { key: "shift_wednesday" as const, label: "水曜日" },
  { key: "shift_thursday" as const, label: "木曜日" },
  { key: "shift_friday" as const, label: "金曜日" },
  { key: "shift_saturday" as const, label: "土曜日" },
  { key: "shift_sunday" as const, label: "日曜日" },
  { key: "shift_holiday" as const, label: "祝日" },
] as const;

// Sentinel value used in the shift Select to represent "no shift / 休み".
// We can't bind a SelectItem to `null` directly because Base UI uses
// strict equality lookups; instead we send this string and convert
// to/from null at the boundary.
const REST_VALUE = "__REST__";

export function StaffForm({
  brandId,
  shopId,
  workPatterns,
  initialData,
}: StaffFormProps) {
  const isEdit = !!initialData;

  // Build a Record<string, string> for Base UI's Select.Root `items` prop
  // so the trigger displays the pattern NAME instead of the raw id.
  // Without this the trigger shows "7" / "6" instead of "通常" / "遅番".
  const shiftItemsMap = useMemo(() => {
    const map: Record<string, string> = { [REST_VALUE]: "休み" };
    workPatterns.forEach((wp) => {
      map[String(wp.id)] = wp.name;
    });
    return map;
  }, [workPatterns]);

  const form = useForm<StaffFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(staffSchema) as any,
    defaultValues: initialData ?? {
      brand_id: brandId,
      shop_id: shopId,
      name: "",
      capacity: 1,
      phone_number: "",
      allocate_order: 0,
      shift_monday: null,
      shift_tuesday: null,
      shift_wednesday: null,
      shift_thursday: null,
      shift_friday: null,
      shift_saturday: null,
      shift_sunday: null,
      shift_holiday: null,
      is_public: true,
      employment_type: "contractor",
      hired_at: "",
      birthday: "",
      children_count: 0,
      monthly_min_salary: 260000,
      hourly_wage: null,
      payroll_email: "",
    },
  });

  async function onSubmit(data: StaffFormValues) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    const result = isEdit
      ? await updateStaff(initialData!.id, formData)
      : await createStaff(formData);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "入力内容を確認してください"
      );
      return;
    }

    toast.success(isEdit ? "スタッフを更新しました" : "スタッフを登録しました");
    if (!isEdit) form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "スタッフ編集" : "スタッフ登録"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <input type="hidden" {...form.register("brand_id")} />
          <input type="hidden" {...form.register("shop_id")} />

          {/* Basic info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                スタッフ名 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="例: 山田太郎"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="capacity">
                  受付可能数 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  {...form.register("capacity")}
                />
                {form.formState.errors.capacity && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.capacity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number">電話番号</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  maxLength={11}
                  {...form.register("phone_number")}
                  placeholder="例: 09012345678"
                />
                {form.formState.errors.phone_number && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.phone_number.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="allocate_order">振り分け順</Label>
                <Input
                  id="allocate_order"
                  type="number"
                  min={0}
                  {...form.register("allocate_order")}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Controller
                control={form.control}
                name="is_public"
                render={({ field }) => (
                  <Switch
                    id="is_public"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="is_public">公開する</Label>
            </div>
          </div>

          {/* Shift section */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">デフォルトシフトパターン</h3>
            <p className="text-xs text-muted-foreground">
              曜日ごとの出勤パターンを設定します。
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SHIFT_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Controller
                    control={form.control}
                    name={key}
                    render={({ field }) => (
                      <Select
                        value={
                          field.value != null
                            ? String(field.value)
                            : REST_VALUE
                        }
                        items={shiftItemsMap}
                        onValueChange={(val) => {
                          if (val == null || val === REST_VALUE) {
                            field.onChange(null);
                          } else {
                            const n = Number(val);
                            field.onChange(Number.isFinite(n) ? n : null);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="休み" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={REST_VALUE}>休み</SelectItem>
                          {workPatterns.map((wp) => (
                            <SelectItem key={wp.id} value={String(wp.id)}>
                              {wp.name}
                              {wp.start_time && wp.end_time && (
                                <span className="ml-1 text-muted-foreground">
                                  ({wp.start_time.slice(0, 5)}〜
                                  {wp.end_time.slice(0, 5)})
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 給与計算属性 (Phase 1) */}
          <Separator />
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">給与計算情報</h3>
              <p className="text-xs text-muted-foreground">
                給与計算ページ (/payroll) で使う属性です。雇用形態 / 入社日 / 誕生日 / 子供数 / 月次最低保証額。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employment_type">雇用形態</Label>
                <Controller
                  control={form.control}
                  name="employment_type"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "contractor"}
                      onValueChange={(v) =>
                        field.onChange(v === "regular" ? "regular" : "contractor")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contractor">業務委託</SelectItem>
                        <SelectItem value="regular">正社員</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_min_salary">
                  月次最低保証額 (税込, 業務委託のみ)
                </Label>
                <Input
                  id="monthly_min_salary"
                  type="number"
                  min={0}
                  step={1000}
                  {...form.register("monthly_min_salary")}
                />
                <p className="text-[10px] text-gray-400">
                  例: 入社 2 年未満 = 240000、2 年以上 = 260000
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hired_at">入社日</Label>
                <Input
                  id="hired_at"
                  type="date"
                  {...form.register("hired_at")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthday">誕生日</Label>
                <Input
                  id="birthday"
                  type="date"
                  {...form.register("birthday")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="children_count">子供の数</Label>
                <Input
                  id="children_count"
                  type="number"
                  min={0}
                  {...form.register("children_count")}
                />
                <p className="text-[10px] text-gray-400">
                  1 人 5,000 円の子供手当に反映
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly_wage">
                  時給 (円, 残業計算用 / 任意)
                </Label>
                <Input
                  id="hourly_wage"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="空欄なら月給 ÷ 160h で自動換算"
                  {...form.register("hourly_wage")}
                />
                <p className="text-[10px] text-gray-400">
                  残業代 (1.25 倍 / 1.5 倍 / 深夜 / 休日) はこの時給を基準に計算します。
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="payroll_email">
                  請求書 受信メール (任意)
                </Label>
                <Input
                  id="payroll_email"
                  type="email"
                  placeholder="未設定ならログインメール (users.email) を使用"
                  {...form.register("payroll_email")}
                />
                <p className="text-[10px] text-gray-400">
                  毎月の請求書はこのアドレスへ送られます。空欄ならログイン用メール宛。
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "保存中..."
                : isEdit
                  ? "更新"
                  : "登録"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
