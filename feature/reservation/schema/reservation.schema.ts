import { z } from "zod";

export const appointmentSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive(),
  // customer_id is optional for meeting / その他 bookings (type 1/2).
  // Those are slot-block entries with no customer attached.
  customer_id: z
    .number()
    .int()
    .positive("顧客を選択してください")
    .nullable()
    .optional(),
  staff_id: z.number().int().positive("スタッフを選択してください"),
  // menu_manage_id is optional for meeting/その他 — those don't map to
  // a menu in the catalog.
  menu_manage_id: z.string().optional().or(z.literal("")),
  type: z.coerce.number().int().min(0).max(99),
  start_at: z.string().min(1, "開始日時は必須です"),
  end_at: z.string().min(1, "終了日時は必須です"),
  memo: z.string().optional().or(z.literal("")),
  customer_record: z.string().optional().or(z.literal("")),
  other_label: z.string().max(128).optional().or(z.literal("")),
  is_couple: z.boolean().default(false),
  sales: z.coerce.number().int().min(0),
  status: z.coerce.number().int().min(0),
  // 来店経路 (visit_sources.id)。新規予約で選んだ媒体をそのまま
  // appointments.visit_source_id に保存することで、カード上の
  // 「Meta広告新規」「TikTok広告新規」のような媒体色付きバッジが
  // ダッシュボード経由の予約でも表示されるようになる。
  // zod は未定義フィールドを strip するため、ここに列挙しないと
  // FormData で送っても createAppointment の insertRow から消える。
  visit_source_id: z.coerce.number().int().positive().optional(),
  // 継続決済フラグ: サブスクの月次課金だけ売上計上したい "幽霊予約"。
  // 来院回数 / チケット消化には入らない (completeAppointment 側で
  // スキップする)。チェックボックスからの入力は "true" / "false"
  // 文字列で飛んでくるので z.preprocess で boolean に落とす。
  is_continued_billing: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v === "true";
      return false;
    }, z.boolean())
    .optional(),
  /**
   * 分割払いの内訳。FormData では JSON 文字列で送る。例:
   *   '[{"method":"square","amount":24750},{"method":"cash","amount":1000}]'
   * 空文字 / 未指定なら単一支払 (payment_method) を使う。
   */
  payment_splits: z.string().optional(),
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
