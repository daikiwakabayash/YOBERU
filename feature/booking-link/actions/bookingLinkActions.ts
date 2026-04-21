"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { bookingLinkSchema } from "../schema/bookingLink.schema";
import { getNextCustomerCode } from "@/feature/customer/services/getNextCustomerCode";
import { revalidatePath } from "next/cache";

function parseForm(raw: Record<string, FormDataEntryValue>) {
  return bookingLinkSchema.safeParse({
    brand_id: Number(raw.brand_id),
    shop_id: raw.shop_id ? Number(raw.shop_id) : null,
    shop_ids: raw.shop_ids ? JSON.parse(String(raw.shop_ids)) : [],
    slug: raw.slug,
    title: raw.title,
    memo: raw.memo || null,
    language: raw.language || "ja",
    menu_manage_ids: raw.menu_manage_ids
      ? JSON.parse(String(raw.menu_manage_ids))
      : [],
    alias_menu_name: raw.alias_menu_name || null,
    staff_mode: Number(raw.staff_mode ?? 0),
    require_cancel_policy: raw.require_cancel_policy === "true",
    cancel_policy_text: raw.cancel_policy_text || null,
    show_line_button: raw.show_line_button === "true",
    line_button_text: raw.line_button_text || null,
    line_button_url: raw.line_button_url || null,
    visit_source_id: raw.visit_source_id ? Number(raw.visit_source_id) : null,
    public_notice: raw.public_notice || null,
    head_tag_template_id: raw.head_tag_template_id
      ? Number(raw.head_tag_template_id)
      : null,
    body_tag_template_id: raw.body_tag_template_id
      ? Number(raw.body_tag_template_id)
      : null,
    immediate_email_enabled:
      raw.immediate_email_enabled === undefined
        ? true
        : raw.immediate_email_enabled === "true",
    immediate_email_subject: raw.immediate_email_subject || null,
    immediate_email_template: raw.immediate_email_template || null,
    reminder_settings: raw.reminder_settings
      ? JSON.parse(String(raw.reminder_settings))
      : [],
  });
}

function isMissingShopIdsColumn(msg: string): boolean {
  return msg.includes("shop_ids") && msg.includes("column");
}

// 00023 / 00024 で追加したカラムが未適用のときのフォールバック判定。
function isMissingTagTemplateColumn(msg: string): boolean {
  return (
    (msg.includes("head_tag_template_id") ||
      msg.includes("body_tag_template_id")) &&
    msg.includes("column")
  );
}

function isMissingImmediateEmailColumn(msg: string): boolean {
  return msg.includes("immediate_email_") && msg.includes("column");
}

function isMissingPublicNoticeColumn(msg: string): boolean {
  // Supabase / PostgREST は "Could not find the 'public_notice' column of
  // 'booking_links' in the schema cache" や "column booking_links.public_notice
  // does not exist" などを返す。カラム名が含まれていれば該当とみなす。
  return msg.includes("public_notice");
}

function stripMigrationOnlyColumns(data: Record<string, unknown>): void {
  delete data.head_tag_template_id;
  delete data.body_tag_template_id;
  delete data.immediate_email_enabled;
  delete data.immediate_email_subject;
  delete data.immediate_email_template;
  delete data.public_notice;
}

/**
 * 「マイグレーション未適用」フォールバック時に、実は中身が空ではない
 * カラムが含まれていないかをチェックする。空ではない = ユーザーが何か
 * 入力した = 黙って捨てると「更新したのに反映されない」不具合になる
 * ので、該当するカラムがあればエラーで返す。
 */
function detectSilentlyDroppedFields(
  data: Record<string, unknown>,
  errorMsg: string
): string | null {
  const drops: string[] = [];
  if (
    isMissingPublicNoticeColumn(errorMsg) &&
    typeof data.public_notice === "string" &&
    data.public_notice.trim().length > 0
  ) {
    drops.push("案内文");
  }
  if (drops.length === 0) return null;
  return (
    `${drops.join(" / ")}は未適用のマイグレーションがあり保存できません。` +
    `supabase/migrations/00025_booking_link_public_notice.sql を適用してください。`
  );
}

export async function createBookingLink(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Convert empty strings to null
  const insertData: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
  );

  try {
    let { error } = await supabase.from("booking_links").insert(insertData);
    // If the new shop_ids column hasn't been added yet, retry without it
    // so the form keeps working pre-migration.
    if (error && isMissingShopIdsColumn(error.message ?? "")) {
      const fallback = { ...insertData };
      delete fallback.shop_ids;
      const retry = await supabase.from("booking_links").insert(fallback);
      error = retry.error;
    }
    // Same pattern for the 00023 tag template / 00024 immediate email
    // columns — strip both sets and retry.
    if (
      error &&
      (isMissingTagTemplateColumn(error.message ?? "") ||
        isMissingImmediateEmailColumn(error.message ?? "") ||
        isMissingPublicNoticeColumn(error.message ?? ""))
    ) {
      // 空でない列を黙って捨てないよう事前チェック。
      const dropMsg = detectSilentlyDroppedFields(
        insertData,
        error.message ?? ""
      );
      if (dropMsg) return { error: dropMsg };

      const fallback = { ...insertData };
      stripMigrationOnlyColumns(fallback);
      const retry = await supabase.from("booking_links").insert(fallback);
      error = retry.error;
    }
    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "データベースエラー",
    };
  }
  revalidatePath("/booking-link");
  return { success: true };
}

export async function updateBookingLink(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseForm(raw);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const updateData: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
  );

  let { error } = await supabase
    .from("booking_links")
    .update(updateData)
    .eq("id", id);
  if (error && isMissingShopIdsColumn(error.message ?? "")) {
    const fallback = { ...updateData };
    delete fallback.shop_ids;
    const retry = await supabase
      .from("booking_links")
      .update(fallback)
      .eq("id", id);
    error = retry.error;
  }
  if (
    error &&
    (isMissingTagTemplateColumn(error.message ?? "") ||
      isMissingImmediateEmailColumn(error.message ?? "") ||
      isMissingPublicNoticeColumn(error.message ?? ""))
  ) {
    // ユーザー入力を黙って捨てないためのガード。
    const dropMsg = detectSilentlyDroppedFields(
      updateData,
      error.message ?? ""
    );
    if (dropMsg) return { error: dropMsg };

    const fallback = { ...updateData };
    stripMigrationOnlyColumns(fallback);
    const retry = await supabase
      .from("booking_links")
      .update(fallback)
      .eq("id", id);
    error = retry.error;
  }
  if (error) return { error: error.message };
  revalidatePath("/booking-link");
  revalidatePath(`/booking-link/${id}`);
  return { success: true };
}

/**
 * Duplicate a booking link. Copies all settings into a new row with a
 * fresh auto-generated slug and appends "（コピー）" to the title.
 * Returns the new link's id so the caller can navigate to its edit page.
 */
export async function duplicateBookingLink(
  id: number
): Promise<{ success: true; id: number } | { error: string }> {
  const supabase = await createClient();

  // Load original
  const { data: original, error: fetchErr } = await supabase
    .from("booking_links")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchErr || !original) {
    return { error: "コピー元のリンクが見つかりません" };
  }

  // Generate a new slug by appending a short timestamp.
  const ts = Date.now().toString(36);
  const baseSlug = String(original.slug ?? "link");
  let newSlug = `${baseSlug}-copy-${ts}`;
  // If slug is unexpectedly long, trim to 64 chars
  if (newSlug.length > 64) newSlug = newSlug.slice(0, 64);

  const clone: Record<string, unknown> = {
    brand_id: original.brand_id,
    shop_id: original.shop_id,
    slug: newSlug,
    title: `${original.title}（コピー）`.slice(0, 128),
    memo: original.memo,
    language: original.language,
    menu_manage_ids: original.menu_manage_ids,
    alias_menu_name: original.alias_menu_name,
    staff_mode: original.staff_mode,
    require_cancel_policy: original.require_cancel_policy,
    cancel_policy_text: original.cancel_policy_text,
    show_line_button: original.show_line_button,
    line_button_text: original.line_button_text,
    line_button_url: original.line_button_url,
    visit_source_id: original.visit_source_id,
    public_notice: (original as Record<string, unknown>).public_notice ?? null,
  };
  // Include reminder_settings if the column exists on the original row
  if ("reminder_settings" in original) {
    clone.reminder_settings = (original as Record<string, unknown>)
      .reminder_settings;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("booking_links")
    .insert(clone)
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return { error: insertErr?.message ?? "コピーに失敗しました" };
  }

  revalidatePath("/booking-link");
  return { success: true, id: inserted.id as number };
}

export async function deleteBookingLink(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_links")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booking-link");
  return { success: true };
}

/**
 * Public: create appointment from public booking form
 */
export async function submitPublicBooking(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const slug = String(raw.slug);

  // Lookup booking link (may fail if table missing)
  let link;
  try {
    link = await supabase
      .from("booking_links")
      .select("*")
      .eq("slug", slug)
      .is("deleted_at", null)
      .single();
  } catch (err) {
    return {
      error:
        err instanceof Error && err.message.includes("does not exist")
          ? "データベースのセットアップが必要です"
          : "予約リンクの読み込みに失敗しました",
    };
  }
  if (link.error || !link.data) {
    return { error: "予約リンクが無効です" };
  }

  const brandId = link.data.brand_id as number;
  const linkShopIds: number[] = Array.isArray(link.data.shop_ids)
    ? (link.data.shop_ids as number[])
    : [];
  const shopId = Number(raw.shop_id || link.data.shop_id);
  if (linkShopIds.length > 0 && shopId && !linkShopIds.includes(shopId)) {
    return { error: "選択された店舗はこの予約リンクの対象外です" };
  }
  const menuManageId = String(raw.menu_manage_id);
  const staffId = raw.staff_id ? Number(raw.staff_id) : null;
  const startAt = String(raw.start_at); // "YYYY-MM-DDTHH:MM:00"
  const endAt = String(raw.end_at);
  const lastName = String(raw.last_name || "");
  const firstName = String(raw.first_name || "");
  const lastNameKana = String(raw.last_name_kana || "") || null;
  const firstNameKana = String(raw.first_name_kana || "") || null;
  const phone = String(raw.phone || "");
  const email = String(raw.email || "") || null;
  const utmSource = String(raw.utm_source || "") || null;

  if (!shopId || !menuManageId || !startAt || !endAt || !lastName || !phone) {
    return { error: "必須項目が入力されていません" };
  }

  // 1. Create or find customer by phone
  let customerId: number;
  const existing = await supabase
    .from("customers")
    .select("id")
    .eq("shop_id", shopId)
    .eq("phone_number_1", phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing.data) {
    customerId = existing.data.id as number;
  } else {
    // カルテナンバーは店舗別に 1, 2, 3... と小さい数字から連番で採番する。
    // 詳細は getNextCustomerCode を参照 (createCustomer 側と同じヘルパー)。
    const nextCode = await getNextCustomerCode(supabase, shopId);

    const inserted = await supabase
      .from("customers")
      .insert({
        brand_id: brandId,
        shop_id: shopId,
        code: nextCode,
        last_name: lastName,
        first_name: firstName || null,
        last_name_kana: lastNameKana,
        first_name_kana: firstNameKana,
        phone_number_1: phone,
        email,
        type: 0,
        gender: 0,
        first_visit_source_id: link.data.visit_source_id ?? null,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      return { error: "顧客登録に失敗しました: " + inserted.error?.message };
    }
    customerId = inserted.data.id as number;
  }

  // 2. Determine staff: use designated staff if provided, otherwise auto-assign
  //    by allocate_order (lowest number = highest priority).
  const { checkStaffAvailability, autoAssignStaff } = await import(
    "@/feature/reservation/actions/reservationActions"
  );

  // 2a. Shift validation. The original implementation only checked for
  //     overlapping appointments, which let customers book on days where
  //     NO staff was scheduled. We now resolve effective shifts for the
  //     date and verify the requested time window falls inside at least
  //     one staff's shift.
  const { getEffectiveShifts } = await import(
    "@/feature/shift/services/getStaffShifts"
  );

  // start_at is sent as "YYYY-MM-DDTHH:MM:00" by the wizard. Use the
  // first 10 chars as the shop-local date for the shift lookup.
  const apptDate = startAt.slice(0, 10);
  const startMin =
    Number(startAt.slice(11, 13)) * 60 + Number(startAt.slice(14, 16));
  const endMin =
    Number(endAt.slice(11, 13)) * 60 + Number(endAt.slice(14, 16));

  let effectiveShifts: Awaited<ReturnType<typeof getEffectiveShifts>> = [];
  try {
    effectiveShifts = await getEffectiveShifts(shopId, apptDate);
  } catch (e) {
    console.error("[submitPublicBooking] failed to load shifts", e);
  }

  const toMin = (hhmm: string | null): number | null => {
    if (!hhmm) return null;
    const h = Number(hhmm.slice(0, 2));
    const m = Number(hhmm.slice(3, 5));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  /** True when the staff's effective shift fully covers [startMin, endMin]. */
  function staffIsOnShift(staffIdToCheck: number): boolean {
    const row = effectiveShifts.find((s) => s.staffId === staffIdToCheck);
    if (!row) return false;
    const sMin = toMin(row.startTime);
    const eMin = toMin(row.endTime);
    if (sMin == null || eMin == null) return false;
    return sMin <= startMin && eMin >= endMin;
  }

  let finalStaffId: number | null = staffId;
  if (finalStaffId) {
    // Designated staff path:
    //   1. must be on shift covering the requested window
    //   2. must not already have an overlapping appointment
    if (!staffIsOnShift(finalStaffId)) {
      return {
        error:
          "選択されたスタッフはその時間帯のシフトに入っていません。別の時間帯または日付を選択してください。",
      };
    }
    const check = await checkStaffAvailability({
      shopId,
      staffId: finalStaffId,
      startAt,
      endAt,
    });
    if (!check.available) {
      return {
        error: "選択されたスタッフのその時間帯は既に埋まっています",
      };
    }
  } else {
    // Auto-assign path. Restrict the candidate pool to staff whose
    // effective shift covers the slot, then ask autoAssignStaff to find
    // the first one whose appointment timeline is also clear.
    const shiftCoveringStaffIds = effectiveShifts
      .filter((s) => {
        const sMin = toMin(s.startTime);
        const eMin = toMin(s.endTime);
        return sMin != null && eMin != null && sMin <= startMin && eMin >= endMin;
      })
      .map((s) => s.staffId);

    if (shiftCoveringStaffIds.length === 0) {
      return {
        error:
          "その日時に出勤しているスタッフがいません。別の日時を選択してください。",
      };
    }

    // Walk the candidates in their effectiveShifts order (which already
    // honours allocate_order via the upstream query) and pick the first
    // with no overlapping appointment.
    for (const candidateId of shiftCoveringStaffIds) {
      const check = await checkStaffAvailability({
        shopId,
        staffId: candidateId,
        startAt,
        endAt,
      });
      if (check.available) {
        finalStaffId = candidateId;
        break;
      }
    }
    if (!finalStaffId) {
      // Fall back to legacy autoAssign just in case (shouldn't fire — we
      // already filtered the pool — but keeps behaviour resilient).
      finalStaffId = await autoAssignStaff({ shopId, startAt, endAt });
    }
    if (!finalStaffId) {
      return {
        error: "その時間帯に対応可能なスタッフがいません",
      };
    }
  }

  // 3. Create appointment
  const code = `APT-${shopId}-${Date.now()}`;
  const apptInsert = await supabase
    .from("appointments")
    .insert({
      brand_id: brandId,
      shop_id: shopId,
      customer_id: customerId,
      staff_id: finalStaffId,
      menu_manage_id: menuManageId,
      code,
      type: 0,
      start_at: startAt,
      end_at: endAt,
      is_couple: false,
      sales: 0,
      status: 0,
      visit_count: 1,
      visit_source_id: link.data.visit_source_id ?? null,
      memo: utmSource ? `流入元: ${utmSource}` : null,
    })
    .select("id")
    .single();

  if (apptInsert.error || !apptInsert.data) {
    return {
      error:
        "予約作成に失敗しました: " + (apptInsert.error?.message ?? "unknown"),
    };
  }

  // 4. 予約確認 (即時) メール送信。失敗しても予約は成功扱い。
  try {
    const { sendBookingConfirmationEmail } = await import(
      "@/feature/booking-link/services/sendBookingEmail"
    );
    await sendBookingConfirmationEmail(
      apptInsert.data.id as number,
      link.data.id as number
    );
  } catch (e) {
    console.error("[submitPublicBooking] 確認メール送信失敗", e);
  }

  revalidatePath("/reservation");
  return { success: true };
}
