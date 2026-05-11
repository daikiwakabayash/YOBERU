"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { appointmentSchema } from "../schema/reservation.schema";
import { revalidatePath } from "next/cache";
import { roundIsoMinuteUp } from "@/helper/utils/time";

/**
 * Ensure a 1-per-shop "system placeholder" customer row exists so that
 * ミーティング / その他 (slot-block) appointments can satisfy the legacy
 * `appointments.customer_id NOT NULL` constraint on deployments where
 * migration 00011 has not been applied yet.
 *
 * The placeholder is invisible to staff: it has a reserved `code` of
 * `SYS-BLOCK-<shopId>` and a recognisable Japanese name. Slot-block
 * aggregation code filters on `type != 0` so this row never appears
 * in sales / marketing / utilization figures.
 *
 * Returns the customer id, or throws on failure — callers should
 * surface the error back to the UI.
 */
async function getOrCreateSystemBlockCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: number,
  shopId: number
): Promise<number> {
  const sysCode = `SYS-BLOCK-${shopId}`;

  // 1. Existing?
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("shop_id", shopId)
    .eq("code", sysCode)
    .maybeSingle();
  if (existing?.id) return existing.id as number;

  // 2. Create it. Leave optional fields empty but fill the NOT NULL
  //    / DEFAULT columns from the initial schema. We use `.select("id")`
  //    on the insert so we get the new id back in one round-trip.
  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      brand_id: brandId,
      shop_id: shopId,
      code: sysCode,
      type: 0,
      last_name: "（ブロック）",
      first_name: "",
      phone_number_1: "00000000000",
      zip_code: "0000000",
      gender: 0,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `Failed to create system block customer: ${error?.message ?? "unknown"}`
    );
  }
  return created.id as number;
}

/**
 * Check if a new or updated appointment would overlap an existing one
 * for the same staff. Returns the overlapping appointment (with customer
 * name) if any, or null if the slot is free.
 *
 * An "overlap" is defined as two appointments for the same staff_id whose
 * [start_at, end_at) intervals intersect:
 *   A.start < B.end AND B.start < A.end
 *
 * Cancelled (cancelled_at not null) and deleted (deleted_at not null)
 * appointments are excluded.
 */
export async function checkStaffAvailability(params: {
  shopId: number;
  staffId: number;
  startAt: string;
  endAt: string;
  excludeAppointmentId?: number | null;
}): Promise<{
  available: boolean;
  conflict?: { id: number; start_at: string; end_at: string; customer_name: string | null };
}> {
  const supabase = await createClient();
  const { shopId, staffId, startAt, endAt, excludeAppointmentId } = params;

  let query = supabase
    .from("appointments")
    .select(
      "id, start_at, end_at, customers(last_name, first_name)"
    )
    .eq("shop_id", shopId)
    .eq("staff_id", staffId)
    .is("cancelled_at", null)
    .is("deleted_at", null)
    // Range overlap condition: A.start < B.end AND B.start < A.end
    // Expressed: existing.start_at < endAt AND existing.end_at > startAt
    .lt("start_at", endAt)
    .gt("end_at", startAt);

  if (excludeAppointmentId != null) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    // If the query itself errors, fall back to "available" to avoid
    // blocking all bookings when something is misconfigured.
    return { available: true };
  }

  const conflict = (data ?? [])[0] as unknown as
    | {
        id: number;
        start_at: string;
        end_at: string;
        customers:
          | { last_name: string | null; first_name: string | null }
          | Array<{ last_name: string | null; first_name: string | null }>
          | null;
      }
    | undefined;

  if (!conflict) return { available: true };

  // Supabase may return customers as an object or a single-element array
  // depending on the inferred schema; handle both.
  const customer = Array.isArray(conflict.customers)
    ? conflict.customers[0] ?? null
    : conflict.customers;
  const name =
    `${customer?.last_name ?? ""} ${customer?.first_name ?? ""}`.trim() ||
    null;
  return {
    available: false,
    conflict: {
      id: conflict.id,
      start_at: conflict.start_at,
      end_at: conflict.end_at,
      customer_name: name,
    },
  };
}

/**
 * Assign the best available staff for an "お任せ" (no designation) booking.
 * Returns the staff id, or null if no staff is available.
 *
 * Strategy: fetch all public staffs for the shop ordered by allocate_order
 * (lower = higher priority). For each, check availability in [startAt, endAt).
 * Return the first available staff.
 */
export async function autoAssignStaff(params: {
  shopId: number;
  startAt: string;
  endAt: string;
}): Promise<number | null> {
  const supabase = await createClient();
  const { shopId, startAt, endAt } = params;

  const { data: staffs } = await supabase
    .from("staffs")
    .select("id")
    .eq("shop_id", shopId)
    .eq("is_public", true)
    .is("deleted_at", null)
    .order("allocate_order", { ascending: true, nullsFirst: false });

  for (const s of staffs ?? []) {
    const check = await checkStaffAvailability({
      shopId,
      staffId: s.id as number,
      startAt,
      endAt,
    });
    if (check.available) return s.id as number;
  }
  return null;
}

function formatTime(iso: string): string {
  // "2026-04-11T10:30:00" -> "10:30"
  return iso.slice(11, 16);
}

function conflictMessage(conflict: {
  customer_name: string | null;
  start_at: string;
  end_at: string;
}): string {
  const who = conflict.customer_name ?? "別の予約";
  return `${formatTime(conflict.start_at)}〜${formatTime(conflict.end_at)} に「${who}」の予約が既に入っています`;
}

export async function createAppointment(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  // type 0 = 通常予約, type 1 = ミーティング, type 2 = その他.
  // Meeting / other bookings are slot-block entries. They don't belong
  // to a real customer, but the legacy `customer_id NOT NULL` constraint
  // on appointments (pre-migration 00011) would still reject a null —
  // so we transparently attach a per-shop "system placeholder" customer
  // before inserting. Aggregation services filter on type != 0 so the
  // placeholder never shows up in sales / marketing / utilization.
  const apptType = Number(raw.type || 0);
  const isSlotBlock = apptType === 1 || apptType === 2;

  const brandId = Number(raw.brand_id);
  const shopId = Number(raw.shop_id);

  let effectiveCustomerId: number | null = raw.customer_id
    ? Number(raw.customer_id)
    : null;
  if (isSlotBlock) {
    try {
      effectiveCustomerId = await getOrCreateSystemBlockCustomer(
        supabase,
        brandId,
        shopId
      );
    } catch (e) {
      return {
        error:
          e instanceof Error
            ? e.message
            : "システム顧客の作成に失敗しました",
      };
    }
  }

  const parsed = appointmentSchema.safeParse({
    ...raw,
    brand_id: brandId,
    shop_id: shopId,
    customer_id: effectiveCustomerId,
    staff_id: Number(raw.staff_id),
    type: apptType,
    is_couple: raw.is_couple === "true",
    sales: Number(raw.sales || 0),
    status: Number(raw.status || 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // end_at を 5 分丸め UP で正規化する。メニューの duration が
  // 59 分など端数で登録されているデータ起因で、予約が 18:59 などの
  // 中途半端な時刻で終わるのを防ぐ (= 稼働率 % が 10 分単位で揃う)。
  parsed.data.end_at = roundIsoMinuteUp(parsed.data.end_at, 5);

  // Overlap check: the same staff cannot be double-booked
  const check = await checkStaffAvailability({
    shopId: parsed.data.shop_id,
    staffId: parsed.data.staff_id,
    startAt: parsed.data.start_at,
    endAt: parsed.data.end_at,
  });
  if (!check.available && check.conflict) {
    return { error: conflictMessage(check.conflict) };
  }

  // 継続決済枠 (営業時間後の +2h ゾーン) のバリデーション。
  // - 通常予約 (type=0) は 営業時間内 のみ。
  // - スロットブロック (type=1/2) も extension 内には入れない (運用ルール:
  //   この時間帯は継続決済の幽霊予約専用)。
  // - is_continued_billing=true なら通る。
  const isContBilling = String(raw.is_continued_billing ?? "") === "true";
  const { isInExtensionZone } = await import("../services/isInExtensionZone");
  const ext = await isInExtensionZone(
    parsed.data.shop_id,
    parsed.data.start_at
  );
  if (ext.inExtension && !isContBilling) {
    return {
      error:
        "営業時間後の枠は『継続決済』の打ち込み専用です。通常予約はこの時間に入れられません。継続決済をチェックしてから保存してください。",
    };
  }

  // Generate unique appointment code
  const code = `APT-${parsed.data.shop_id}-${Date.now()}`;

  // Stamp the per-appointment visit_count snapshot from the customer's
  // current cumulative count + 1, so visit_count = 1 means "first visit".
  // Meeting / other entries skip this (no customer).
  let stampedVisitCount: number | null = null;
  if (!isSlotBlock && parsed.data.customer_id) {
    stampedVisitCount = 1;
    try {
      const { data: cust } = await supabase
        .from("customers")
        .select("visit_count")
        .eq("id", parsed.data.customer_id)
        .maybeSingle();
      stampedVisitCount = (cust?.visit_count ?? 0) + 1;
    } catch {
      /* keep default 1 */
    }
  }

  // Build the insert row — drop empty menu_manage_id / other_label so
  // the DB accepts NULL for them. Meeting / other bookings use a
  // placeholder menu id so the NOT NULL constraint on menu_manage_id
  // (from the initial schema) still validates; we key off `type` for
  // every aggregation instead.
  const insertRow: Record<string, unknown> = {
    ...parsed.data,
    code,
    visit_count: stampedVisitCount,
  };
  if (!parsed.data.menu_manage_id) {
    insertRow.menu_manage_id = isSlotBlock
      ? apptType === 1
        ? "SYS-MEETING"
        : apptType === 2
          ? "SYS-OTHER"
          : "SYS-BREAK"
      : "";
  }
  if (!parsed.data.other_label) delete insertRow.other_label;
  // Pass-through slot_block_type_code so the calendar can look up the
  // master palette when rendering. Only present when the UI explicitly
  // sent it (slot-block bookings).
  if (raw.slot_block_type_code) {
    insertRow.slot_block_type_code = raw.slot_block_type_code;
  }
  // 追加料金の消化タイミング (today / next / null)
  if (raw.additional_charge_consume_timing) {
    const t = String(raw.additional_charge_consume_timing);
    if (t === "today" || t === "next") {
      insertRow.additional_charge_consume_timing = t;
    }
  }
  // 分割払い: フォームから JSON 文字列で送られてきていたら parse して
  // JSONB 列に格納。空 or 不正なら何もしない (= NULL のまま)。
  if (raw.payment_splits) {
    const ps = String(raw.payment_splits).trim();
    if (ps && ps !== "null" && ps !== "[]") {
      try {
        const parsed = JSON.parse(ps) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          insertRow.payment_splits = parsed;
        }
      } catch {
        /* ignore malformed JSON */
      }
    }
  }

  const { data: inserted, error } = await supabase
    .from("appointments")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // 通常予約 (type=0) かつ実顧客が紐付いているときのみ確認メール / LINE 送信。
  // ミーティング / その他のブロック予約は顧客ではないのでスキップ。
  // 送信失敗は例外を投げず、予約作成は成功扱いにする。
  if (!isSlotBlock && inserted?.id) {
    try {
      const { sendBookingConfirmationEmail } = await import(
        "@/feature/booking-link/services/sendBookingEmail"
      );
      await sendBookingConfirmationEmail(inserted.id as number, null);
    } catch (e) {
      console.error("[createAppointment] 確認メール送信失敗", e);
    }
    try {
      const { sendBookingLineNotice } = await import(
        "@/feature/line-chat/services/sendBookingLineNotice"
      );
      await sendBookingLineNotice(inserted.id as number);
    } catch (e) {
      console.error("[createAppointment] LINE 通知失敗", e);
    }
  }

  revalidatePath("/reservation");
  return { success: true };
}

export async function updateAppointment(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const updateData: Record<string, unknown> = {};

  // Only update fields that are present in the form
  if (raw.staff_id) updateData.staff_id = Number(raw.staff_id);
  if (raw.menu_manage_id) updateData.menu_manage_id = raw.menu_manage_id;
  if (raw.start_at) updateData.start_at = raw.start_at;
  // end_at は 5 分丸め UP で正規化 (HH:59 のような中途半端を防ぐ)
  if (raw.end_at) updateData.end_at = roundIsoMinuteUp(String(raw.end_at), 5);
  if (raw.memo !== undefined) updateData.memo = raw.memo;
  if (raw.customer_record !== undefined)
    updateData.customer_record = raw.customer_record;
  if (raw.sales !== undefined) updateData.sales = Number(raw.sales);
  if (raw.status !== undefined) updateData.status = Number(raw.status);
  if (raw.visit_source_id)
    updateData.visit_source_id = Number(raw.visit_source_id);
  if (raw.payment_method) updateData.payment_method = raw.payment_method;
  // 追加料金の消化タイミング: 'today' / 'next' / 'null' (= NULL clear)
  if (raw.additional_charge_consume_timing !== undefined) {
    const t = String(raw.additional_charge_consume_timing ?? "");
    if (t === "today" || t === "next") {
      updateData.additional_charge_consume_timing = t;
    } else if (t === "null" || t === "") {
      updateData.additional_charge_consume_timing = null;
    }
  }
  // payment_splits は JSON 文字列で送られてくる。空 / 不正なら NULL
  // を入れて単一支払フォールバックする。
  if (raw.payment_splits !== undefined) {
    const ps = String(raw.payment_splits ?? "").trim();
    if (!ps || ps === "null" || ps === "[]") {
      updateData.payment_splits = null;
    } else {
      try {
        const parsed = JSON.parse(ps) as unknown;
        if (Array.isArray(parsed)) {
          updateData.payment_splits = parsed;
        }
      } catch {
        // 不正 JSON は無視 (上書きしない)
      }
    }
  }
  if (raw.additional_charge !== undefined)
    updateData.additional_charge = Number(raw.additional_charge);
  if (raw.is_member_join !== undefined)
    updateData.is_member_join = raw.is_member_join === "true";
  // 継続決済: 後からフラグ反転できるように update でも受け付ける。
  if (raw.is_continued_billing !== undefined)
    updateData.is_continued_billing = raw.is_continued_billing === "true";
  // Slot block editing: let the user swap between meeting / other /
  // break and change the free-form title on an existing row.
  if (raw.type !== undefined) updateData.type = Number(raw.type);
  if (raw.slot_block_type_code !== undefined)
    updateData.slot_block_type_code = raw.slot_block_type_code || null;
  if (raw.other_label !== undefined)
    updateData.other_label = raw.other_label || null;

  // If time or staff changed, verify no overlap + extension-zone rule
  if (updateData.staff_id || updateData.start_at || updateData.end_at) {
    // Look up current row to know current shop/staff/time/billing-flag
    const { data: current } = await supabase
      .from("appointments")
      .select("shop_id, staff_id, start_at, end_at, is_continued_billing")
      .eq("id", id)
      .single();
    if (current) {
      const check = await checkStaffAvailability({
        shopId: current.shop_id as number,
        staffId: (updateData.staff_id as number) ?? (current.staff_id as number),
        startAt: (updateData.start_at as string) ?? (current.start_at as string),
        endAt: (updateData.end_at as string) ?? (current.end_at as string),
        excludeAppointmentId: id,
      });
      if (!check.available && check.conflict) {
        return { error: conflictMessage(check.conflict) };
      }
      // 継続決済枠 (営業時間後の +2h) チェック
      const effectiveStart =
        (updateData.start_at as string) ?? (current.start_at as string);
      const effectiveBilling =
        updateData.is_continued_billing !== undefined
          ? (updateData.is_continued_billing as boolean)
          : (current.is_continued_billing as boolean);
      const { isInExtensionZone } = await import(
        "../services/isInExtensionZone"
      );
      const ext = await isInExtensionZone(
        current.shop_id as number,
        effectiveStart
      );
      if (ext.inExtension && !effectiveBilling) {
        return {
          error:
            "営業時間後の枠は『継続決済』専用です。通常予約はこの時間に移動できません。継続決済をチェックしてから保存してください。",
        };
      }
    }
  }

  const { error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  revalidatePath(`/reservation/${id}`);
  return { success: true };
}

export async function cancelAppointment(id: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("appointments")
    .update({
      cancelled_at: new Date().toISOString(),
      status: 3,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  return { success: true };
}

/**
 * Mark an appointment as a same-day cancellation (status = 4).
 *
 * Distinct from `cancelAppointment` (status = 3):
 *  - Saves the staff-typed reason into customer_record so future bookings
 *    can surface why the customer cancelled.
 *  - Does NOT touch customers.visit_count or customers.last_visit_date —
 *    a no-show is not a real visit.
 *  - Sets cancelled_at so the appointment is excluded from staff
 *    availability / overlap checks.
 *
 * The calendar block badge picks up the new status via
 * STATUS_BADGE / inline mapping which both include 4 = "当日キャンセル".
 */
export async function sameDayCancelAppointment(id: number, reason: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("appointments")
    .update({
      status: 4,
      cancelled_at: new Date().toISOString(),
      customer_record: reason || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  revalidatePath(`/reservation/${id}`);
  return { success: true };
}

/**
 * Revert a cancelled / no-show appointment back to 待機 (status = 0).
 *
 * Targets status 3 (通常キャンセル), 4 (当日キャンセル), 99 (no-show).
 * Clears `cancelled_at` so the row re-enters staff availability checks,
 * and wipes `customer_record` (the staff-typed cancel reason) per the
 * product decision.
 *
 * Slot-overlap policy: 警告して許可. We run `checkStaffAvailability`
 * against the row's saved staff/time, but always perform the update.
 * If a conflicting appointment is found, return it as a non-fatal
 * `warning` string so the UI can surface a toast — the user is then
 * expected to reschedule one of the two.
 */
export async function uncancelAppointment(id: number): Promise<{
  success?: true;
  error?: string;
  warning?: string;
}> {
  const supabase = await createClient();

  const { data: current, error: fetchErr } = await supabase
    .from("appointments")
    .select("shop_id, staff_id, start_at, end_at")
    .eq("id", id)
    .single();
  if (fetchErr || !current) {
    return { error: fetchErr?.message ?? "予約が見つかりません" };
  }

  const check = await checkStaffAvailability({
    shopId: current.shop_id as number,
    staffId: current.staff_id as number,
    startAt: current.start_at as string,
    endAt: current.end_at as string,
    excludeAppointmentId: id,
  });

  const { error } = await supabase
    .from("appointments")
    .update({
      status: 0,
      cancelled_at: null,
      customer_record: null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  revalidatePath(`/reservation/${id}`);

  if (!check.available && check.conflict) {
    return { success: true, warning: conflictMessage(check.conflict) };
  }
  return { success: true };
}

export async function deleteAppointment(id: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("appointments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reservation");
  return { success: true };
}
