import { z } from "zod";

export const paymentMethodSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(32),
  sort_number: z.coerce.number().int().default(0),
  is_active: z.boolean().default(true),
});

export type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>;
