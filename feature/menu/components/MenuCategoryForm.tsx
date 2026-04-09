"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  menuCategorySchema,
  type MenuCategoryFormValues,
} from "../schema/menu.schema";
import {
  createMenuCategory,
  updateMenuCategory,
} from "../actions/menuActions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface MenuCategoryFormProps {
  brandId: number;
  initialData?: MenuCategoryFormValues & { id: number };
}

export function MenuCategoryForm({
  brandId,
  initialData,
}: MenuCategoryFormProps) {
  const isEdit = !!initialData;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MenuCategoryFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(menuCategorySchema) as any,
    defaultValues: {
      brand_id: brandId,
      name: initialData?.name ?? "",
      sort_number: initialData?.sort_number ?? 0,
      shop_id: initialData?.shop_id ?? null,
    },
  });

  const onSubmit = async (values: MenuCategoryFormValues) => {
    const formData = new FormData();
    formData.append("brand_id", String(values.brand_id));
    formData.append("name", values.name);
    formData.append("sort_number", String(values.sort_number));
    if (values.shop_id) {
      formData.append("shop_id", String(values.shop_id));
    }

    if (isEdit && initialData) {
      await updateMenuCategory(initialData.id, formData);
    } else {
      await createMenuCategory(formData);
    }
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>
          {isEdit ? "メニューカテゴリ編集" : "メニューカテゴリ登録"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register("brand_id", { valueAsNumber: true })} />

          <div className="space-y-1.5">
            <Label htmlFor="name">カテゴリ名</Label>
            <Input id="name" placeholder="例: カット" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

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
            <Button type="button" variant="outline" onClick={() => history.back()}>
              キャンセル
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
