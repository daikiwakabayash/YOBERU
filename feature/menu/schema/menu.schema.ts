import { z } from "zod";

export const menuCategorySchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().nullable().optional(),
  name: z.string().min(1, "カテゴリ名は必須です").max(256),
  sort_number: z.coerce.number().int().min(0).default(0),
});

export type MenuCategoryFormValues = z.infer<typeof menuCategorySchema>;

export const menuSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().nullable().optional(),
  category_id: z.number().int().positive("メニューカテゴリを選択してください"),
  menu_type: z.coerce.number().int().min(0).max(1).default(0),
  name: z.string().min(1, "メニュー名は必須です").max(255),
  price: z.coerce.number().int().min(0).default(0),
  price_disp_type: z.boolean().default(false),
  duration: z.coerce.number().int().min(1, "施術時間は1分以上にしてください"),
  image_url: z.string().optional().or(z.literal("")),
  available_count: z.coerce.number().int().min(0).optional(),
  status: z.boolean().default(true),
  sort_number: z.coerce.number().int().min(0).default(0),
  // 会員プラン区分:
  //   null        = 通常メニュー (施術メニュー等)
  //   'ticket'    = 回数券 (ticket_count で回数指定)
  //   'subscription' = 月額サブスクリプション
  plan_type: z
    .preprocess((v) => (v === "" || v == null ? null : v), z.enum(["ticket", "subscription"]).nullable())
    .optional(),
  // plan_type='ticket' のときの総回数 (4 回券なら 4)
  ticket_count: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
});

export type MenuFormValues = z.infer<typeof menuSchema>;
