"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  facilitySchema,
  type FacilityFormValues,
} from "../schema/facility.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createFacility, updateFacility } from "../actions/facilityActions";
import { toast } from "sonner";

interface FacilityFormProps {
  brandId: number;
  shopId: number;
  initialData?: FacilityFormValues & { id: number };
}

export function FacilityForm({
  brandId,
  shopId,
  initialData,
}: FacilityFormProps) {
  const isEdit = !!initialData;

  const form = useForm<FacilityFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(facilitySchema) as any,
    defaultValues: initialData ?? {
      brand_id: brandId,
      shop_id: shopId,
      name: "",
      max_book_count: 1,
      allocate_order: 0,
    },
  });

  async function onSubmit(data: FacilityFormValues) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    const result = isEdit
      ? await updateFacility(initialData!.id, formData)
      : await createFacility(formData);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "入力内容を確認してください"
      );
      return;
    }

    toast.success(isEdit ? "設備を更新しました" : "設備を登録しました");
    if (!isEdit) form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "設備編集" : "設備登録"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...form.register("brand_id")} />
          <input type="hidden" {...form.register("shop_id")} />

          <div className="space-y-2">
            <Label htmlFor="name">
              設備名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="例: ベッド1"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_book_count">
                受付可能数 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="max_book_count"
                type="number"
                min={1}
                {...form.register("max_book_count")}
              />
              {form.formState.errors.max_book_count && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.max_book_count.message}
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
