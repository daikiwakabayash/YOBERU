import { z } from "zod";

export const staffSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive("店舗を選択してください"),
  name: z.string().min(1, "スタッフ名は必須です").max(255),
  capacity: z.coerce.number().int().min(1, "1以上を入力してください").default(1),
  phone_number: z.string().max(11).optional().or(z.literal("")),
  allocate_order: z.coerce.number().int().min(0).optional(),
  shift_monday: z.coerce.number().int().optional().nullable(),
  shift_tuesday: z.coerce.number().int().optional().nullable(),
  shift_wednesday: z.coerce.number().int().optional().nullable(),
  shift_thursday: z.coerce.number().int().optional().nullable(),
  shift_friday: z.coerce.number().int().optional().nullable(),
  shift_saturday: z.coerce.number().int().optional().nullable(),
  shift_sunday: z.coerce.number().int().optional().nullable(),
  shift_holiday: z.coerce.number().int().optional().nullable(),
  is_public: z.boolean().default(true),
  // 給与計算 (Phase 1) 用属性
  employment_type: z
    .enum(["contractor", "regular"])
    .default("contractor"),
  hired_at: z.string().optional().nullable().or(z.literal("")),
  birthday: z.string().optional().nullable().or(z.literal("")),
  children_count: z.coerce.number().int().min(0).default(0),
  monthly_min_salary: z.coerce.number().int().min(0).default(260000),
  // 残業代計算用の時給ベース (空欄なら monthly_min_salary / 160h でフォールバック)
  hourly_wage: z.coerce.number().int().min(0).optional().nullable(),
  // ログイン用メールアドレス。Supabase Auth とこのスタッフ行を紐付ける鍵。
  // 入力すると users.email を upsert し、staffs.user_id を更新する。
  login_email: z
    .string()
    .max(255)
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  // 請求書メール送信先 (空 / 未設定なら users.email を使う)
  payroll_email: z
    .string()
    .max(255)
    .optional()
    .or(z.literal("")),
});

export type StaffFormValues = z.infer<typeof staffSchema>;
