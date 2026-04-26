"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { staffSchema } from "../schema/staff.schema";
import { revalidatePath } from "next/cache";

/**
 * staffs.user_id に紐付ける users.id を確定する。
 *
 * 解決順序:
 *  1. login_email が指定されていれば users をその email で検索。
 *     - 既存 → その id を使う
 *     - 不在 → users 行を新規作成し、その id を使う
 *  2. raw.user_id が明示的に渡っていればその数値を使う
 *  3. ブランド配下の最初のユーザー (= 暫定の brand owner) にフォールバック
 *  4. それも無ければ id=1
 */
async function resolveUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawUserId: FormDataEntryValue | undefined,
  brandId: number,
  staffName: string,
  loginEmail?: string | null
): Promise<number> {
  // 1. login_email 指定あり: users を upsert
  if (loginEmail && loginEmail.trim()) {
    const email = loginEmail.trim();
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing?.id) return existing.id as number;

    const { data: created, error: insertErr } = await supabase
      .from("users")
      .insert({ email, name: staffName, brand_id: brandId })
      .select("id")
      .single();
    if (!insertErr && created?.id) return created.id as number;
    // insert に失敗した場合 (race など) もう一度 select して使う
    const { data: retry } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (retry?.id) return retry.id as number;
  }

  // 2. 明示的な user_id
  if (rawUserId) {
    const n = Number(rawUserId);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  // 3. ブランド配下の最初のユーザー
  try {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as number;
  } catch {
    // fall through
  }
  return 1;
}

export async function createStaff(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = staffSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    capacity: Number(raw.capacity || 1),
    allocate_order: raw.allocate_order ? Number(raw.allocate_order) : undefined,
    shift_monday: raw.shift_monday ? Number(raw.shift_monday) : null,
    shift_tuesday: raw.shift_tuesday ? Number(raw.shift_tuesday) : null,
    shift_wednesday: raw.shift_wednesday ? Number(raw.shift_wednesday) : null,
    shift_thursday: raw.shift_thursday ? Number(raw.shift_thursday) : null,
    shift_friday: raw.shift_friday ? Number(raw.shift_friday) : null,
    shift_saturday: raw.shift_saturday ? Number(raw.shift_saturday) : null,
    shift_sunday: raw.shift_sunday ? Number(raw.shift_sunday) : null,
    shift_holiday: raw.shift_holiday ? Number(raw.shift_holiday) : null,
    is_public: raw.is_public === "true",
    // 給与計算属性
    employment_type:
      raw.employment_type === "regular" ? "regular" : "contractor",
    hired_at: raw.hired_at || null,
    birthday: raw.birthday || null,
    children_count: raw.children_count ? Number(raw.children_count) : 0,
    monthly_min_salary: raw.monthly_min_salary
      ? Number(raw.monthly_min_salary)
      : 260000,
    hourly_wage:
      raw.hourly_wage != null && raw.hourly_wage !== ""
        ? Number(raw.hourly_wage)
        : null,
    login_email: raw.login_email ? String(raw.login_email).trim() : "",
    payroll_email: raw.payroll_email ? String(raw.payroll_email) : "",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const userId = await resolveUserId(
    supabase,
    raw.user_id,
    parsed.data.brand_id,
    parsed.data.name,
    parsed.data.login_email
  );

  // login_email は users 側の値であり staffs テーブルには列が無いので
  // insert ペイロードから外す。
  const { login_email: _ignored, ...staffPayload } = parsed.data;
  void _ignored;
  const insertData: Record<string, unknown> = {
    ...staffPayload,
    user_id: userId,
  };

  const { error } = await supabase.from("staffs").insert(insertData);
  if (error) return { error: error.message };

  revalidatePath("/staff");
  return { success: true };
}

export async function updateStaff(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = staffSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    capacity: Number(raw.capacity || 1),
    allocate_order: raw.allocate_order ? Number(raw.allocate_order) : undefined,
    shift_monday: raw.shift_monday ? Number(raw.shift_monday) : null,
    shift_tuesday: raw.shift_tuesday ? Number(raw.shift_tuesday) : null,
    shift_wednesday: raw.shift_wednesday ? Number(raw.shift_wednesday) : null,
    shift_thursday: raw.shift_thursday ? Number(raw.shift_thursday) : null,
    shift_friday: raw.shift_friday ? Number(raw.shift_friday) : null,
    shift_saturday: raw.shift_saturday ? Number(raw.shift_saturday) : null,
    shift_sunday: raw.shift_sunday ? Number(raw.shift_sunday) : null,
    shift_holiday: raw.shift_holiday ? Number(raw.shift_holiday) : null,
    is_public: raw.is_public === "true",
    // 給与計算属性
    employment_type:
      raw.employment_type === "regular" ? "regular" : "contractor",
    hired_at: raw.hired_at || null,
    birthday: raw.birthday || null,
    children_count: raw.children_count ? Number(raw.children_count) : 0,
    monthly_min_salary: raw.monthly_min_salary
      ? Number(raw.monthly_min_salary)
      : 260000,
    hourly_wage:
      raw.hourly_wage != null && raw.hourly_wage !== ""
        ? Number(raw.hourly_wage)
        : null,
    login_email: raw.login_email ? String(raw.login_email).trim() : "",
    payroll_email: raw.payroll_email ? String(raw.payroll_email) : "",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // login_email が指定されていれば users を upsert して staffs.user_id を
  // 付け替える (= ログインユーザーとの紐付けを変更する)。
  let userIdToSet: number | null = null;
  if (parsed.data.login_email && parsed.data.login_email.trim()) {
    userIdToSet = await resolveUserId(
      supabase,
      undefined,
      parsed.data.brand_id,
      parsed.data.name,
      parsed.data.login_email
    );
  }

  const { login_email: _ignored, ...staffPayload } = parsed.data;
  void _ignored;
  const updatePayload: Record<string, unknown> = { ...staffPayload };
  if (userIdToSet != null) {
    updatePayload.user_id = userIdToSet;
  }

  const { error } = await supabase
    .from("staffs")
    .update(updatePayload)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  revalidatePath("/punch");
  return { success: true };
}

export async function deleteStaff(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staffs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { success: true };
}

/**
 * Lightweight action to update only allocate_order (priority for
 * auto-assignment on no-designation bookings). Lower number = higher
 * priority.
 */
export async function updateStaffAllocateOrder(
  id: number,
  allocateOrder: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staffs")
    .update({ allocate_order: allocateOrder })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/staff");
  revalidatePath("/reservation");
  return { success: true };
}

/**
 * Drag-and-drop 並び替え用。orderedIds の順番で allocate_order を 1, 2, 3...
 * と振り直す (先頭 = 優先度最高 = allocate_order 1)。
 */
export async function reorderStaffs(orderedIds: number[]) {
  const supabase = await createClient();
  // Supabase は一括 update を直接サポートしないので 1 件ずつ発行
  // (スタッフは店舗あたり 10-20 件程度のため問題なし)。
  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from("staffs")
        .update({ allocate_order: idx + 1 })
        .eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/staff");
  revalidatePath("/reservation");
  return { success: true };
}
