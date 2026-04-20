import { z } from "zod";

export const reminderSettingSchema = z.object({
  type: z.enum(["email", "sms", "line"]),
  offset_days: z.coerce.number().int().min(0).max(30),
  send_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM 形式で入力してください"),
  template: z.string().max(2000).default(""),
  subject: z.string().max(200).optional().default(""),
  enabled: z.boolean().default(true),
});

export const bookingLinkSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().nullable(),
  // New: zero-or-more shop IDs the link is restricted to. Empty array
  // means "all brand shops" (= legacy shop_id IS NULL behaviour).
  shop_ids: z.array(z.number().int().positive()).default([]),
  slug: z
    .string()
    .min(1, "URLスラッグを入力してください")
    .max(64)
    .regex(/^[a-z0-9._-]+$/i, "a-z, 0-9, ., _, - のみ使用可能"),
  title: z.string().min(1, "タイトルを入力してください").max(128),
  memo: z.string().optional().nullable(),
  language: z.string().default("ja"),
  menu_manage_ids: z.array(z.string()).default([]),
  alias_menu_name: z.string().max(128).optional().nullable(),
  staff_mode: z.coerce.number().int().min(0).max(2).default(0),
  require_cancel_policy: z.boolean().default(true),
  cancel_policy_text: z.string().optional().nullable(),
  show_line_button: z.boolean().default(false),
  line_button_text: z.string().optional().nullable(),
  line_button_url: z.string().url().optional().nullable().or(z.literal("")),
  visit_source_id: z.number().int().optional().nullable(),
  head_tag_template_id: z.number().int().positive().optional().nullable(),
  body_tag_template_id: z.number().int().positive().optional().nullable(),
  reminder_settings: z.array(reminderSettingSchema).default([]),
});

export type BookingLinkFormValues = z.infer<typeof bookingLinkSchema>;
export type ReminderSettingValues = z.infer<typeof reminderSettingSchema>;
