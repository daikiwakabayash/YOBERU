import { z } from "zod";

export const customerSchema = z.object({
  brand_id: z.number().int().positive(),
  shop_id: z.number().int().positive("店舗を選択してください"),
  type: z.coerce.number().int().min(0).max(2).default(0),
  last_name: z.string().max(32).optional().or(z.literal("")),
  first_name: z.string().max(32).optional().or(z.literal("")),
  last_name_kana: z.string().max(64).optional().or(z.literal("")),
  first_name_kana: z.string().max(64).optional().or(z.literal("")),
  phone_number_1: z.string().max(11).optional().or(z.literal("")),
  phone_number_2: z.string().max(11).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  zip_code: z.string().max(7).optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  gender: z.coerce.number().int().min(0).max(2).default(0),
  birth_date: z.string().optional().or(z.literal("")),
  staff_id: z.number().int().optional().nullable(),
  customer_tag_id: z.number().int().optional().nullable(),
  occupation: z.string().max(64).optional().or(z.literal("")),
  is_send_dm: z.boolean().optional(),
  is_send_mail: z.boolean().optional(),
  is_send_line: z.boolean().optional(),
  line_id: z.string().max(32).optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
