import { z } from "zod";

export const storeSchema = z.object({
  uuid: z.string().min(1, "UUIDは必須です"),
  brand_id: z.number().int().positive(),
  area_id: z.number().int().positive("地域を選択してください"),
  user_id: z.number().int().positive(),
  name: z.string().min(1, "店舗名は必須です").max(255),
  frame_min: z.coerce.number().int().refine((v) => [5, 10, 15, 30, 60].includes(v), {
    message: "5, 10, 15, 30, 60分のいずれかを選択してください",
  }),
  scale: z.coerce.number().int().min(1).max(3),
  email1: z.string().email("正しいメールアドレスを入力してください"),
  email2: z.string().email().optional().or(z.literal("")),
  line_url: z.string().url().optional().or(z.literal("")),
  zip_code: z.string().length(7, "郵便番号は7桁で入力してください"),
  address: z.string().min(1, "住所は必須です").max(255),
  nearest_station_access: z.string().max(255).optional().or(z.literal("")),
  phone_number: z.string().min(1, "電話番号は必須です").max(11),
  shop_url: z.string().optional().or(z.literal("")),
  is_public: z.boolean().default(true),
  sort_number: z.coerce.number().int().min(0).default(0),
});

export type StoreFormValues = z.infer<typeof storeSchema>;
