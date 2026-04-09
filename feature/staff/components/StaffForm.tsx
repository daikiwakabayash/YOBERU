"use client";

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

export function StaffForm({
  brandId,
  shopId,
  workPatterns,
  initialData,
}: StaffFormProps) {
  const isEdit = !!initialData;

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
                        value={field.value ?? undefined}
                        onValueChange={(val) => {
                          field.onChange(val ?? null);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="休み" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null as unknown as number}>
                            休み
                          </SelectItem>
                          {workPatterns.map((wp) => (
                            <SelectItem key={wp.id} value={wp.id}>
                              {wp.name}
                              {wp.start_time && wp.end_time && (
                                <span className="ml-1 text-muted-foreground">
                                  ({wp.start_time}〜{wp.end_time})
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
