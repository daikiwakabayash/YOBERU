"use server";

import { createClient } from "@/helper/lib/supabase/server";
import {
  createClient as createAdminClient,
  SupabaseClient,
} from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import {
  createAccountSchema,
  updateAccountSchema,
  resetPasswordSchema,
  type CreateAccountInput,
  type UpdateAccountInput,
  type ResetPasswordInput,
} from "../schema/accountSchema";

type SimpleResult = { ok: true } | { ok: false; error: string };
type DataResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Root 権限チェック。public.users.brand_id IS NULL を root と判定。
 */
async function requireRoot(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) {
    return { ok: false, error: "ログインが必要です" };
  }
  const { data } = await supabase
    .from("users")
    .select("brand_id")
    .eq("email", authUser.email)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "ユーザーが見つかりません" };
  }
  if (data.brand_id != null) {
    return { ok: false, error: "この操作には root 権限が必要です" };
  }
  return { ok: true };
}

function getAdminClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) return null;
  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data) return null;
    const found = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (found) return found.id;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

export async function createAccount(
  input: CreateAccountInput
): Promise<DataResult<{ userId: number }>> {
  const auth = await requireRoot();
  if (!auth.ok) return auth;

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(" / "),
    };
  }
  const { loginId, password, name, permissionType, brandId } = parsed.data;
  const effectiveBrandId = permissionType === "root" ? null : brandId;

  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      error:
        "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が設定されていません",
    };
  }

  // 既存重複チェック (public.users.email)
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("email", loginId)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "このログイン ID は既に使われています" };
  }

  // 1. auth.users に作成
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: loginId,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return {
      ok: false,
      error: `認証アカウント作成に失敗しました: ${
        createErr?.message ?? "unknown"
      }`,
    };
  }

  // 2. public.users に INSERT
  const { data: inserted, error: insertErr } = await admin
    .from("users")
    .insert({
      email: loginId,
      password: "supabase_auth",
      name,
      brand_id: effectiveBrandId,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    try {
      await admin.auth.admin.deleteUser(created.user.id);
    } catch {
      /* best effort */
    }
    return {
      ok: false,
      error: `users 登録に失敗しました: ${insertErr?.message ?? "unknown"}`,
    };
  }

  revalidatePath("/account");
  return { ok: true, userId: inserted.id as number };
}

export async function updateAccount(
  input: UpdateAccountInput
): Promise<SimpleResult> {
  const auth = await requireRoot();
  if (!auth.ok) return auth;

  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(" / "),
    };
  }
  const { id, name, permissionType, brandId } = parsed.data;
  const effectiveBrandId = permissionType === "root" ? null : brandId;

  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が必要です",
    };
  }

  // root を最低 1 人残す: root → limited に変える場合は他の root が居るか確認
  if (permissionType === "limited") {
    const { data: current } = await admin
      .from("users")
      .select("brand_id")
      .eq("id", id)
      .maybeSingle();
    if (current?.brand_id == null) {
      const { count } = await admin
        .from("users")
        .select("id", { count: "exact", head: true })
        .is("brand_id", null);
      if ((count ?? 0) <= 1) {
        return {
          ok: false,
          error:
            "root 権限を持つアカウントを 0 にはできません。他のアカウントを root に昇格してから変更してください",
        };
      }
    }
  }

  const { error } = await admin
    .from("users")
    .update({ name, brand_id: effectiveBrandId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: `更新に失敗しました: ${error.message}` };
  }

  revalidatePath("/account");
  return { ok: true };
}

export async function resetPassword(
  input: ResetPasswordInput
): Promise<SimpleResult> {
  const auth = await requireRoot();
  if (!auth.ok) return auth;

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(" / "),
    };
  }
  const { id, newPassword } = parsed.data;

  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が必要です",
    };
  }

  const { data: target } = await admin
    .from("users")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (!target?.email) {
    return { ok: false, error: "対象アカウントが見つかりません" };
  }

  const authUserId = await findAuthUserIdByEmail(admin, target.email as string);
  if (!authUserId) {
    return {
      ok: false,
      error: "認証アカウントが見つかりません (auth.users に存在しない)",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    password: newPassword,
  });
  if (error) {
    return {
      ok: false,
      error: `パスワード更新に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/account");
  return { ok: true };
}

export async function deleteAccount(id: number): Promise<SimpleResult> {
  const auth = await requireRoot();
  if (!auth.ok) return auth;

  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が必要です",
    };
  }

  // 自分自身の削除を禁止
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const { data: target } = await admin
    .from("users")
    .select("id, email, brand_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return { ok: false, error: "対象アカウントが見つかりません" };
  }
  if (
    authUser?.email &&
    (target.email as string).toLowerCase() === authUser.email.toLowerCase()
  ) {
    return { ok: false, error: "自分自身のアカウントは削除できません" };
  }

  // 最後の root を消さない
  if (target.brand_id == null) {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("brand_id", null);
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error:
          "root 権限のアカウントは最低 1 つ必要です。他を root に昇格してから削除してください",
      };
    }
  }

  // brands.user_id / staffs.user_id から参照されていたら拒否
  const { count: brandRefs } = await admin
    .from("brands")
    .select("id", { count: "exact", head: true })
    .eq("user_id", id);
  if ((brandRefs ?? 0) > 0) {
    return {
      ok: false,
      error:
        "このアカウントはブランドの所有者として登録されています。先にブランド所有者を別アカウントに切り替えてください",
    };
  }
  const { count: staffRefs } = await admin
    .from("staffs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", id)
    .is("deleted_at", null);
  if ((staffRefs ?? 0) > 0) {
    return {
      ok: false,
      error:
        "このアカウントは有効なスタッフに紐付いています。先にスタッフ側のログインメールを変更してください",
    };
  }

  // auth.users → public.users の順で削除
  const authUserId = await findAuthUserIdByEmail(admin, target.email as string);
  if (authUserId) {
    const { error: aErr } = await admin.auth.admin.deleteUser(authUserId);
    if (aErr) {
      return {
        ok: false,
        error: `認証アカウント削除に失敗しました: ${aErr.message}`,
      };
    }
  }

  const { error: uErr } = await admin.from("users").delete().eq("id", id);
  if (uErr) {
    return {
      ok: false,
      error: `users 削除に失敗しました: ${uErr.message}`,
    };
  }

  revalidatePath("/account");
  return { ok: true };
}
