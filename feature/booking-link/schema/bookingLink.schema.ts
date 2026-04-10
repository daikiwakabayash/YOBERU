import { z } from "zod";

export const bookingLinkSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().nullable(),
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
});

export type BookingLinkFormValues = z.infer<typeof bookingLinkSchema>;
