"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  customerSchema,
  type CustomerFormValues,
} from "../schema/customer.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { createCustomer, updateCustomer } from "../actions/customerActions";
import { toast } from "sonner";

interface CustomerFormProps {
  brandId: number;
  shopId: number;
  staffs: { id: number; name: string }[];
  initialData?: CustomerFormValues & { id: number };
}

export function CustomerForm({
  brandId,
  shopId,
  staffs,
  initialData,
}: CustomerFormProps) {
  const isEdit = !!initialData;

  const form = useForm<CustomerFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(customerSchema) as any,
    defaultValues: initialData ?? {
      brand_id: brandId,
      shop_id: shopId,
      type: 0,
      last_name: "",
      first_name: "",
      last_name_kana: "",
      first_name_kana: "",
      phone_number_1: "",
      phone_number_2: "",
      email: "",
      zip_code: "",
      address: "",
      gender: 0,
      birth_date: "",
      staff_id: null,
      customer_tag_id: null,
      occupation: "",
      is_send_dm: false,
      is_send_mail: false,
      is_send_line: false,
      line_id: "",
      description: "",
    },
  });

  async function onSubmit(data: CustomerFormValues) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    const result = isEdit
      ? await updateCustomer(initialData!.id, formData)
      : await createCustomer(formData);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "入力内容を確認してください"
      );
      return;
    }

    toast.success(isEdit ? "顧客情報を更新しました" : "顧客を登録しました");
    if (!isEdit) form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "顧客編集" : "顧客登録"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <input type="hidden" {...form.register("brand_id")} />
          <input type="hidden" {...form.register("shop_id")} />

          {/* 基本情報 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">基本情報</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="last_name">姓</Label>
                <Input
                  id="last_name"
                  {...form.register("last_name")}
                  placeholder="例: 山田"
                />
                {form.formState.errors.last_name && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.last_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="first_name">名</Label>
                <Input
                  id="first_name"
                  {...form.register("first_name")}
                  placeholder="例: 太郎"
                />
                {form.formState.errors.first_name && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.first_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name_kana">姓（カナ）</Label>
                <Input
                  id="last_name_kana"
                  {...form.register("last_name_kana")}
                  placeholder="例: ヤマダ"
                />
                {form.formState.errors.last_name_kana && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.last_name_kana.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="first_name_kana">名（カナ）</Label>
                <Input
                  id="first_name_kana"
                  {...form.register("first_name_kana")}
                  placeholder="例: タロウ"
                />
                {form.formState.errors.first_name_kana && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.first_name_kana.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">種別</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? 0)}
                    onValueChange={(val) => field.onChange(Number(val))}
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="種別を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">一般</SelectItem>
                      <SelectItem value="1">会員</SelectItem>
                      <SelectItem value="2">退会</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* 連絡先 */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">連絡先</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="phone_number_1">電話番号1</Label>
                <Input
                  id="phone_number_1"
                  type="tel"
                  maxLength={11}
                  {...form.register("phone_number_1")}
                  placeholder="例: 09012345678"
                />
                {form.formState.errors.phone_number_1 && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.phone_number_1.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number_2">電話番号2</Label>
                <Input
                  id="phone_number_2"
                  type="tel"
                  maxLength={11}
                  {...form.register("phone_number_2")}
                  placeholder="例: 09087654321"
                />
                {form.formState.errors.phone_number_2 && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.phone_number_2.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  placeholder="例: yamada@example.com"
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 住所 */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">住所</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="zip_code">郵便番号</Label>
                <Input
                  id="zip_code"
                  maxLength={7}
                  {...form.register("zip_code")}
                  placeholder="例: 1000001"
                />
                {form.formState.errors.zip_code && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.zip_code.message}
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">住所</Label>
                <Input
                  id="address"
                  {...form.register("address")}
                  placeholder="例: 東京都千代田区..."
                />
                {form.formState.errors.address && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.address.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 属性 */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">属性</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="gender">性別</Label>
                <Controller
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <Select
                      value={String(field.value ?? 0)}
                      onValueChange={(val) => field.onChange(Number(val))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="性別を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">未設定</SelectItem>
                        <SelectItem value="1">男性</SelectItem>
                        <SelectItem value="2">女性</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date">生年月日</Label>
                <Input
                  id="birth_date"
                  type="date"
                  {...form.register("birth_date")}
                />
                {form.formState.errors.birth_date && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.birth_date.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">職業</Label>
                <Input
                  id="occupation"
                  {...form.register("occupation")}
                  placeholder="例: 会社員"
                />
                {form.formState.errors.occupation && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.occupation.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 設定 */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">設定</h3>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <Controller
                  control={form.control}
                  name="is_send_dm"
                  render={({ field }) => (
                    <Switch
                      id="is_send_dm"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="is_send_dm">DM送付</Label>
              </div>
              <div className="flex items-center gap-3">
                <Controller
                  control={form.control}
                  name="is_send_mail"
                  render={({ field }) => (
                    <Switch
                      id="is_send_mail"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="is_send_mail">メール送付</Label>
              </div>
              <div className="flex items-center gap-3">
                <Controller
                  control={form.control}
                  name="is_send_line"
                  render={({ field }) => (
                    <Switch
                      id="is_send_line"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="is_send_line">LINE送付</Label>
              </div>
            </div>
          </div>

          {/* 担当 */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">担当</h3>
            <div className="space-y-2">
              <Label htmlFor="staff_id">担当スタッフ</Label>
              <Controller
                control={form.control}
                name="staff_id"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(val) => {
                      field.onChange(val ? Number(val) : null);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="スタッフを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffs.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* 備考 */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">備考</h3>
            <div className="space-y-2">
              <Label htmlFor="description">備考</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="特記事項があれば入力してください"
                rows={4}
              />
              {form.formState.errors.description && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.description.message}
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
