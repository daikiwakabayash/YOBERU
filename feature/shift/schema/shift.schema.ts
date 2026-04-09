import { z } from "zod";

export const workPatternSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive("店舗を選択してください"),
  name: z.string().min(1, "出勤パターン名は必須です").max(64),
  abbreviation_name: z.string().max(64).optional().or(z.literal("")),
  abbreviation_color: z.string().max(7).optional().or(z.literal("")),
  start_time: z.string().min(1, "開始時間は必須です"),
  end_time: z.string().min(1, "終了時間は必須です"),
});

export type WorkPatternFormValues = z.infer<typeof workPatternSchema>;

export const staffShiftSchema = z.object({
  staff_id: z.number().int().positive(),
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive(),
  work_pattern_id: z.number().int().positive("出勤パターンを選択してください"),
  start_date: z.string().min(1, "日付は必須です"),
  start_time: z.string().min(1, "開始時間は必須です"),
  end_time: z.string().min(1, "終了時間は必須です"),
  memo: z.string().max(255).optional().or(z.literal("")),
  is_public: z.boolean().default(true),
});

export type StaffShiftFormValues = z.infer<typeof staffShiftSchema>;
