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
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // service_role キーの簡易検証 (JWT payload が role:"service_role" か,
  // かつ ref が SUPABASE_URL と一致するか)
  // - 取り違えで anon キーが入っていると admin API は "User not allowed"
  // - 別プロジェクトのキーが入っていると "Invalid API key"
  // 事前にチェックして親切なエラーを出す。
  try {
    const payload = JSON.parse(
      Buffer.from(serviceRoleKey.split(".")[1] ?? "", "base64").toString()
    ) as { role?: string; ref?: string };
    if (payload.role !== "service_role") {
      return {
        ok: false,
        error: `SUPABASE_SERVICE_ROLE_KEY が anon キーになっています (role="${payload.role}")。Supabase の Project Settings → API から service_role キーをコピーして Vercel の環境変数を更新し、Redeploy してください。`,
      };
    }
    // SUPABASE_URL から ref を抽出 (https://<ref>.supabase.co)
    const urlMatch = supabaseUrl.match(/^https?:\/\/([a-z0-9]+)\.supabase\./i);
    const urlRef = urlMatch?.[1] ?? null;
    if (urlRef && payload.ref && urlRef !== payload.ref) {
      return {
        ok: false,
        error: `SUPABASE_URL のプロジェクト (${urlRef}) と SUPABASE_SERVICE_ROLE_KEY のプロジェクト (${payload.ref}) が一致していません。同じ Supabase プロジェクトのキーを Vercel に設定してください。`,
      };
    }
  } catch {
    /* JWT パース失敗時は無視して通常フローに進める */
  }

  // 既存 auth.users に同一 email があるかチェック (再作成エラー回避)
  // listUsers で email 一致を探し、見つかれば再利用する。
  let authUserId: string | null = null;
  try {
    const { data: list } = await admin.auth.admin.listUsers();
    const existingAuth = list?.users.find(
      (u) => u.email?.toLowerCase() === parsed.data.adminLoginId.toLowerCase()
    );
    if (existingAuth) {
      authUserId = existingAuth.id;
      // パスワードを今回入力されたものに更新 (運用上のリセットも兼ねる)
      await admin.auth.admin.updateUserById(existingAuth.id, {
        password: parsed.data.adminPassword,
        email_confirm: true,
      });
    }
  } catch {
    /* listUsers 失敗は無視。下の createUser でエラーになる */
  }

  if (!authUserId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: parsed.data.adminLoginId,
        password: parsed.data.adminPassword,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? "unknown";
      let hint = "";
      if (msg === "User not allowed") {
        hint =
          " (SUPABASE_SERVICE_ROLE_KEY が anon キーになっている可能性が高いです)";
      } else if (/invalid api key/i.test(msg)) {
        hint =
          " (SUPABASE_SERVICE_ROLE_KEY と SUPABASE_URL が別プロジェクトのものになっているか、キー値が破損しています。Supabase の Project Settings → API から正しい service_role キーを再コピーして Vercel に設定し、Redeploy してください)";
      }
      return {
        ok: false,
        error: `管理者アカウント作成に失敗しました: ${msg}${hint}`,
      };
    }
    authUserId = created.user.id;
  }

  // 以降のエラー時のロールバック用 (auth user を「今回新規作成した」場合のみ削除)
  const createdNewAuthUser = !!authUserId; // 既存だった場合はここまで来てない (false にしない)
  const rollbackAuthUserId = authUserId;
  const rollback = async () => {
    // 既存ユーザーを再利用したケースでは auth.users は触らない
    if (!createdNewAuthUser || !rollbackAuthUserId) return;
    try {
      await admin.auth.admin.deleteUser(rollbackAuthUserId);
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
  //
  // 既存の public.users.email が同じ場合は UPDATE 扱いにする (上で auth
  // ユーザーを再利用したケースとの整合性)。
  const { data: existingPublicUser } = await admin
    .from("users")
    .select("id")
    .eq("email", parsed.data.adminLoginId)
    .is("deleted_at", null)
    .maybeSingle();

  let userId: number;
  if (existingPublicUser) {
    userId = existingPublicUser.id as number;
  } else {
    const { data: insertedUser, error: userErr } = await admin
      .from("users")
      .insert({
        email: parsed.data.adminLoginId,
        password: "supabase_auth",
        name:
          parsed.data.adminEmail &&
          parsed.data.adminEmail !== parsed.data.adminLoginId
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
    userId = insertedUser.id as number;
  }

  // 6. brands を作成
  const { data: insertedBrand, error: brandErr } = await admin
    .from("brands")
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      user_id: userId,
    })
    .select("id")
    .single();
  if (brandErr || !insertedBrand) {
    // ロールバック: 直前に作った users (新規作成だった場合のみ) と auth.users
    if (!existingPublicUser) {
      try {
        await admin.from("users").delete().eq("id", userId);
      } catch {
        /* ignore */
      }
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
    .eq("id", userId);

  revalidatePath("/brand");
  return { ok: true, brandId: insertedBrand.id as number };
}
