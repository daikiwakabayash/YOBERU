import { z } from "zod";

export const appointmentSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive(),
  customer_id: z.number().int().positive("顧客を選択してください"),
  staff_id: z.number().int().positive("スタッフを選択してください"),
  menu_manage_id: z.string().min(1, "メニューを選択してください"),
  type: z.coerce.number().int().min(0).max(99),
  start_at: z.string().min(1, "開始日時は必須です"),
  end_at: z.string().min(1, "終了日時は必須です"),
  memo: z.string().optional().or(z.literal("")),
  customer_record: z.string().optional().or(z.literal("")),
  is_couple: z.boolean().default(false),
  sales: z.coerce.number().int().min(0),
  status: z.coerce.number().int().min(0),
});

export type AppointmentFormValues = z.infer<typeof appointmentSchema>;

/**
 * Schema for the multi-step reservation register form.
 * date and start_time are separate (UX-friendly).
 * end_at is computed from menu.duration on the server side.
 */
export const reservationRegisterSchema = z.object({
  customer_id: z.number().int().positive("顧客を選択してください"),
  menu_manage_id: z.string().min(1, "メニューを選択してください"),
  staff_id: z.number().int().positive("スタッフを選択してください"),
  date: z.string().min(1, "日付を選択してください"),
  start_time: z.string().min(1, "時間を選択してください"),
  memo: z.string().optional().or(z.literal("")),
  is_couple: z.boolean().default(false),
});

export type ReservationRegisterFormValues = z.infer<
  typeof reservationRegisterSchema
>;
