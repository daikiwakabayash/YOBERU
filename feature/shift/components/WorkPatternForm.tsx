"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  workPatternSchema,
  type WorkPatternFormValues,
} from "../schema/shift.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createWorkPattern, updateWorkPattern } from "../actions/shiftActions";
import { toast } from "sonner";

interface WorkPatternFormProps {
  brandId: number;
  shopId: number;
  initialData?: WorkPatternFormValues & { id: number };
}

export function WorkPatternForm({
  brandId,
  shopId,
  initialData,
}: WorkPatternFormProps) {
  const isEdit = !!initialData;

  const form = useForm<WorkPatternFormValues>({
    resolver: zodResolver(workPatternSchema),
    defaultValues: initialData ?? {
      brand_id: brandId,
      shop_id: shopId,
      name: "",
      abbreviation_name: "",
      abbreviation_color: "#3B82F6",
      start_time: "09:00",
      end_time: "18:00",
    },
  });

  async function onSubmit(data: WorkPatternFormValues) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    const result = isEdit
      ? await updateWorkPattern(initialData!.id, formData)
      : await createWorkPattern(formData);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "入力内容を確認してください"
      );
      return;
    }

    toast.success(
      isEdit ? "出勤パターンを更新しました" : "出勤パターンを登録しました"
    );
    if (!isEdit) form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit ? "出勤パターン編集" : "出勤パターン登録"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...form.register("brand_id")} />
          <input type="hidden" {...form.register("shop_id")} />

          <div className="space-y-2">
            <Label htmlFor="name">
              パターン名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="例: 早番"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="abbreviation_name">略称名</Label>
              <Input
                id="abbreviation_name"
                {...form.register("abbreviation_name")}
                placeholder="例: 早"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abbreviation_color">略称色</Label>
              <Input
                id="abbreviation_color"
                type="color"
                {...form.register("abbreviation_color")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">
                開始時間 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="start_time"
                type="time"
                {...form.register("start_time")}
              />
              {form.formState.errors.start_time && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.start_time.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">
                終了時間 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="end_time"
                type="time"
                {...form.register("end_time")}
              />
              {form.formState.errors.end_time && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.end_time.message}
                </p>
              )}
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
