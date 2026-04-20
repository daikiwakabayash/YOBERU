import { z } from "zod";

export const tagTemplateSchema = z.object({
  brand_id: z.number().int().positive(),
  title: z.string().min(1, "タイトルを入力してください").max(128),
  content: z.string().default(""),
  memo: z.string().optional().nullable(),
  sort_number: z.coerce.number().int().default(0),
});

export type TagTemplateFormValues = z.infer<typeof tagTemplateSchema>;
