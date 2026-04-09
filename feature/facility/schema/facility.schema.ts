import { z } from "zod";

export const facilitySchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive("店舗を選択してください"),
  name: z.string().min(1, "設備名は必須です").max(64),
  max_book_count: z.coerce.number().int().min(1, "1以上を入力してください"),
  allocate_order: z.coerce.number().int().min(0),
});

export type FacilityFormValues = z.infer<typeof facilitySchema>;
