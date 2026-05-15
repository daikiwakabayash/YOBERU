"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * 新ブランドを作成する Server Action.
 *
 * フロー:
 *   1. 認可: 現在のユーザーが root (users.brand_id IS NULL) であることを確認
 *   2. バリデーション: zod schema
 *   3. Supabase Auth に管理者ユーザーを作成 (admin API, service_role 鍵)
 *   4. public.users に管理者レコードを作成 (brand_id 紐付け前なので NULL)
 *   5. brands に新ブランドを作成 (user_id = 管理者の id)
 *   6. users.brand_id を新ブランド id で更新 (循環参照を回避するため事後更新)
 */

const createBrandSchema = z.object({
  name: z.string().min(1, "ブランド名は必須です").max(255),
  code: z
    .string()
    .min(3, "企業コードは 3 文字以上で入力してください")
    .max(64, "企業コードは 64 文字以下にしてください")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "企業コードは半角英数字とハイフン / アンダースコアのみ使用できます"
    ),
  adminLoginId: z
    .string()
    .email("ログイン ID はメールアドレス形式で入力してください")
    .max(255),
  adminPassword: z
    .string()
    .min(8, "初期パスワードは 8 文字以上にしてください")
    .max(72),
  adminEmail: z
    .string()
    .email("メールアドレスを正しく入力してください")
    .max(255),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export async function createBrand(
  input: CreateBrandInput
): Promise<{ ok: true; brandId: number } | { ok: false; error: string }> {
  // 1. 認可
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !authUser?.email) {
    return { ok: false, error: "ログインが必要です" };
  }
  const { data: currentUser } = await supabase
    .from("users")
    .select("id, brand_id")
    .eq("email", authUser.email)
    .maybeSingle();
  if (!currentUser) {
    return { ok: false, error: "ユーザーが見つかりません" };
  }
  if (currentUser.brand_id != null) {
    return { ok: false, error: "ブランド作成権限がありません (root のみ)" };
  }

  // 2. バリデーション
  const parsed = createBrandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(" / "),
    };
  }

  // 3. 企業コードの重複チェック
  const { data: existing } = await supabase
    .from("brands")
    .select("id")
    .eq("code", parsed.data.code)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "この企業コードはすでに使われています" };
  }

  // 4. Supabase Auth に管理者ユーザーを作成 (service_role)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return {
      ok: false,
      error:
        "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が設定されていません",
    };
  }
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.adminLoginId,
    password: parsed.data.adminPassword,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return {
      ok: false,
      error: `管理者アカウント作成に失敗しました: ${createErr?.message ?? "unknown"}`,
    };
  }

  // 以降のエラー時のロールバック用
  const rollback = async () => {
    try {
      if (created.user) await admin.auth.admin.deleteUser(created.user.id);
    } catch {
      /* best effort */
    }
  };

  // 5. public.users に管理者レコードを作成 (brand_id は後で更新)
  //
  // 重要: public.users.email は「Supabase Auth のログイン email」と
  // 一致させる必要がある。これが揃ってないと、ログイン後のロール判定
  // (users.brand_id を email で引く) が落ちて root 扱いされない。
  // 連絡用メール (adminEmail) は name の括弧に併記する形で残す。
  const { data: insertedUser, error: userErr } = await admin
    .from("users")
    .insert({
      email: parsed.data.adminLoginId, // ← ログイン ID と一致させる
      password: "supabase_auth", // public.users.password は NOT NULL なのでダミー
      name:
        parsed.data.adminEmail && parsed.data.adminEmail !== parsed.data.adminLoginId
          ? `${parsed.data.name} 管理者 (${parsed.data.adminEmail})`
          : `${parsed.data.name} 管理者`,
    })
    .select("id")
    .single();
  if (userErr || !insertedUser) {
    await rollback();
    return {
      ok: false,
      error: `users 登録に失敗しました: ${userErr?.message ?? "unknown"}`,
    };
  }

  // 6. brands を作成
  const { data: insertedBrand, error: brandErr } = await admin
    .from("brands")
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      user_id: insertedUser.id,
    })
    .select("id")
    .single();
  if (brandErr || !insertedBrand) {
    // ロールバック: 直前に作った users と auth.users を削除
    try {
      await admin.from("users").delete().eq("id", insertedUser.id);
    } catch {
      /* ignore */
    }
    await rollback();
    return {
      ok: false,
      error: `brands 登録に失敗しました: ${brandErr?.message ?? "unknown"}`,
    };
  }

  // 7. users.brand_id を新ブランド id で更新
  await admin
    .from("users")
    .update({ brand_id: insertedBrand.id })
    .eq("id", insertedUser.id);

  revalidatePath("/brand");
  return { ok: true, brandId: insertedBrand.id as number };
}
