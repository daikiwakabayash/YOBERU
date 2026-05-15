import { z } from "zod";

export type PermissionType = "root" | "limited";

export const createAccountSchema = z
  .object({
    loginId: z
      .string()
      .email("ログイン ID はメールアドレス形式で入力してください")
      .max(255),
    password: z
      .string()
      .min(8, "パスワードは 8 文字以上にしてください")
      .max(72),
    name: z.string().min(1, "氏名は必須です").max(255),
    permissionType: z.enum(["root", "limited"]),
    brandId: z.number().int().positive().nullable(),
  })
  .refine(
    (v) => (v.permissionType === "limited" ? v.brandId != null : true),
    {
      message: "限定権限の場合はブランドを選択してください",
      path: ["brandId"],
    }
  );

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(255),
    permissionType: z.enum(["root", "limited"]),
    brandId: z.number().int().positive().nullable(),
  })
  .refine(
    (v) => (v.permissionType === "limited" ? v.brandId != null : true),
    {
      message: "限定権限の場合はブランドを選択してください",
      path: ["brandId"],
    }
  );

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const resetPasswordSchema = z.object({
  id: z.number().int().positive(),
  newPassword: z
    .string()
    .min(8, "パスワードは 8 文字以上にしてください")
    .max(72),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
