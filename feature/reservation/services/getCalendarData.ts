"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { generateTimeSlots, toLocalDateString } from "@/helper/utils/time";
import type { CalendarData, CalendarAppointment } from "../types";
import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";
import { getDailyStaffUtilization } from "@/feature/sales/services/getStaffUtilization";

/**
 * appointments.payment_splits (JSONB) → 型付きの配列に変換。
 * 期待形式は [{method: string, amount: number}, …]。形式が崩れていれば
 * null を返して呼び出し側で「単一支払フォールバック」させる。
 */
function parsePaymentSplits(
  raw: unknown
): Array<{ method: string; amount: number }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ method: string; amount: number }> = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { method?: unknown; amount?: unknown };
    const method = typeof rec.method === "string" ? rec.method : "";
    const amount = Number(rec.amount);
    if (!method || !Number.isFinite(amount) || amount < 0) continue;
    out.push({ method, amount: Math.round(amount) });
  }
  return out.length > 0 ? out : null;
}

/**
 * Aggregation service for the reservation calendar page.
 * Fetches all data needed to render the day-view calendar in one call.
 */
export async function getCalendarData(
  shopId: number,
  date: string
): Promise<CalendarData> {
  const supabase = await createClient();

  // Calculate next day for range query
  const nextDate = new Date(date + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  // Helper: select-string with all the modern columns. If a column the
  // SELECT references doesn't exist yet (e.g. is_member_join was added
  // by migration 00007 and the user hasn't run it), PostgREST returns
  // an error and we'd silently render an EMPTY calendar — that was the
  // root cause of the "予約が反映されなくなった" report. The fallback
  // SELECT below uses only columns from migration 00001 + 00002 which
  // every deployment has.
  // other_label + slot_block_type_code come from migration 00010 / 00012.
  // The SAFE fallback omits them so pre-migration deployments still load.
  const FULL_SELECT =
    "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, payment_splits, additional_charge_consume_timing, cancelled_at, is_member_join, is_continued_billing, consumed_plan_id, consumed_amount, other_label, slot_block_type_code, customers(code, last_name, first_name, phone_number_1, visit_count, created_at)";
  const SAFE_SELECT =
    "id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, payment_splits, additional_charge_consume_timing, cancelled_at, customers(code, last_name, first_name, phone_number_1, visit_count, created_at)";

  function fetchAppointments(select: string) {
    return supabase
      .from("appointments")
      .select(select)
      .eq("shop_id", shopId)
      .gte("start_at", `${date}T00:00:00`)
      .lt("start_at", `${nextDateStr}T00:00:00`)
      // NOTE: cancelled_at is intentionally NOT filtered here so that
      // same-day cancellations and regular cancellations stay visible on
      // the calendar (rendered as a narrow strip on the right edge).
      // checkStaffAvailability still filters cancelled out, so the slot
      // remains free for new bookings.
      .is("deleted_at", null)
      .order("start_at");
  }

  // Parallel: shop settings + effective shifts + appointments +
  // slot block master + visit sources. Batching everything into one
  // Promise.all saves 200-400ms vs the previous serial approach
  // where slot_block_types and visit_sources were fetched AFTER
  // appointments returned.
  const [
    shopRes,
    effectiveShifts,
    apptResRaw,
    sbTypesRaw,
    sourcesRaw,
    utilizationRaw,
  ] = await Promise.all([
    supabase
      .from("shops")
      .select("frame_min, brand_id")
      .eq("id", shopId)
      .single(),
    getEffectiveShifts(shopId, date).catch(() => []),
    fetchAppointments(FULL_SELECT),
    // slot_block_types — batched (no extra round trip)
    (async () => {
      try {
        const r = await supabase
          .from("slot_block_types")
          .select("code, label, color, label_text_color")
          .is("deleted_at", null);
        return r.data;
      } catch {
        return null;
      }
    })(),
    // visit_sources — batched
    (async () => {
      try {
        const r = await supabase
          .from("visit_sources")
          .select("id, name, color, label_text_color")
          .eq("shop_id", shopId)
          .is("deleted_at", null);
        return r.data;
      } catch {
        return null;
      }
    })(),
    // Utilization — previously serial AFTER appointments. Now parallel.
    getDailyStaffUtilization(shopId, date).catch(
      () =>
        new Map<
          number,
          import("@/feature/sales/services/getStaffUtilization").StaffUtilizationRow
        >()
    ),
  ]);

  // If the appointment query failed because of a missing newer column
  // (most commonly is_member_join from migration 00007), retry with the
  // SAFE select. Anything else falls through to the empty array.
  let apptRes = apptResRaw;
  if (apptRes.error) {
    const msg = String(apptRes.error.message ?? "");
    if (
      msg.includes("is_member_join") ||
      msg.includes("is_continued_billing") ||
      msg.includes("consumed_plan_id") ||
      msg.includes("consumed_amount") ||
      msg.includes("other_label") ||
      msg.includes("slot_block_type_code") ||
      msg.includes("does not exist")
    ) {
      console.error(
        "[getCalendarData] full appointment SELECT failed, retrying SAFE select",
        apptRes.error
      );
      apptRes = await fetchAppointments(SAFE_SELECT);
    } else {
      console.error("[getCalendarData] appointment query failed", apptRes.error);
    }
  }

  // Build slot block master map from the pre-fetched data (batched in
  // the initial Promise.all above — no extra round trip).
  const slotBlockMasterMap = new Map<
    string,
    { label: string; color: string | null; labelTextColor: string | null }
  >();
  for (const t of (sbTypesRaw ?? []) as Array<{
    code: string;
    label: string;
    color: string | null;
    label_text_color: string | null;
  }>) {
    slotBlockMasterMap.set(t.code, {
      label: t.label,
      color: t.color,
      labelTextColor: t.label_text_color,
    });
  }

  // Fallback hardcoded palette (used when the master row isn't found,
  // e.g. legacy rows or migration not applied yet).
  const SLOT_BLOCK_FALLBACK: Record<
    string,
    { label: string; color: string; labelTextColor: string }
  > = {
    meeting: {
      label: "ミーティング",
      color: "#9333ea",
      labelTextColor: "#ffffff",
    },
    other: {
      label: "その他",
      color: "#0ea5e9",
      labelTextColor: "#ffffff",
    },
    break: {
      label: "休憩",
      color: "#f59e0b",
      labelTextColor: "#ffffff",
    },
  };

  function resolveSlotBlock(
    typeNum: number,
    code: string | null
  ): {
    code: string;
    label: string;
    color: string | null;
    labelTextColor: string | null;
  } | null {
    if (typeNum === 0) return null;
    // Legacy data fallback: if slot_block_type_code wasn't backfilled,
    // derive from the legacy numeric type (1=meeting, 2=other).
    const resolvedCode =
      code ?? (typeNum === 1 ? "meeting" : typeNum === 2 ? "other" : "meeting");
    const master = slotBlockMasterMap.get(resolvedCode);
    if (master) {
      return {
        code: resolvedCode,
        label: master.label,
        color: master.color,
        labelTextColor: master.labelTextColor,
      };
    }
    const fb = SLOT_BLOCK_FALLBACK[resolvedCode];
    if (fb) {
      return {
        code: resolvedCode,
        label: fb.label,
        color: fb.color,
        labelTextColor: fb.labelTextColor,
      };
    }
    return {
      code: resolvedCode,
      label: resolvedCode,
      color: "#6b7280",
      labelTextColor: "#ffffff",
    };
  }

  const frameMin = shopRes.data?.frame_min ?? 15;
  // Because we pass `select` as a string at runtime (so we can swap to
  // SAFE_SELECT on error), Supabase typegen widens the return type to a
  // generic union that loses the column names. Cast back to the shape
  // the rest of this file actually uses. is_member_join is optional
  // because the SAFE select doesn't include it.
  type RawAppointment = {
    id: number;
    staff_id: number;
    customer_id: number;
    start_at: string;
    end_at: string;
    status: number;
    type: number;
    menu_manage_id: string;
    memo: string | null;
    sales: number | null;
    customer_record: string | null;
    visit_count: number | null;
    visit_source_id: number | null;
    additional_charge: number | null;
    payment_method: string | null;
    payment_splits?: unknown;
    additional_charge_consume_timing?: string | null;
    cancelled_at: string | null;
    is_member_join?: boolean | null;
    is_continued_billing?: boolean | null;
    consumed_plan_id?: number | null;
    consumed_amount?: number | null;
    other_label?: string | null;
    slot_block_type_code?: string | null;
    customers:
      | {
          code: string | null;
          last_name: string | null;
          first_name: string | null;
          phone_number_1: string | null;
          visit_count: number | null;
          created_at: string | null;
        }
      | Array<{
          code: string | null;
          last_name: string | null;
          first_name: string | null;
          phone_number_1: string | null;
          visit_count: number | null;
          created_at: string | null;
        }>
      | null;
  };
  const appointments = (apptRes.data ?? []) as unknown as RawAppointment[];

  // 「新規」= この予約が顧客の人生初予約のとき。
  // appointments.visit_count は createAppointment 時に「その時点での
  // customers.visit_count + 1」で stamp されるので、visit_count == 1 が
  // ちょうど「初回予約」を意味する。
  //
  // 旧実装は「customer.created_at がカレンダー表示日 >= の場合」を新規と
  // していたが、本日 (4/25) 登録した顧客の 5/1 予約は created_at < 5/1 で
  // false に倒れて「会員」表示になる不具合があった。visit_count を素直に
  // 見ることでこの未来日問題を解消する。

  // Build source map from the pre-fetched data (batched above).
  const sourceMap = new Map<
    number,
    { name: string; color: string | null; label_text_color: string | null }
  >(
    ((sourcesRaw ?? []) as Array<{
      id: number;
      name: string;
      color: string | null;
      label_text_color: string | null;
    }>).map((s) => [
      s.id,
      {
        name: s.name,
        color: s.color ?? null,
        label_text_color: s.label_text_color ?? null,
      },
    ])
  );

  // Fetch menus separately (menu_manage_id is VARCHAR, no FK join)
  const menuManageIds = [
    ...new Set((appointments ?? []).map((a) => a.menu_manage_id)),
  ];
  let menuMap = new Map<string, { name: string; duration: number }>();
  if (menuManageIds.length > 0) {
    const { data: menus } = await supabase
      .from("menus")
      .select("menu_manage_id, name, duration")
      .in("menu_manage_id", menuManageIds)
      .is("deleted_at", null);
    menuMap = new Map(
      (menus ?? []).map((m) => [
        m.menu_manage_id,
        { name: m.name, duration: m.duration },
      ])
    );
  }

  // 4. Build staff list with shift info + today's utilization
  //    (utilization was fetched in parallel above).
  const utilization = utilizationRaw;

  const staffs: CalendarData["staffs"] = effectiveShifts.map((s) => {
    const u = utilization.get(s.staffId);
    return {
      id: s.staffId,
      name: s.staffName,
      isWorking: !!s.startTime,
      shiftStart: s.startTime,
      shiftEnd: s.endTime,
      shiftColor: s.abbreviationColor,
      utilizationRate: u && u.openMin > 0 ? u.rate : null,
      openMin: u?.openMin ?? 0,
      busyMin: u?.busyMin ?? 0,
      utilizationContributions: u?.contributions ?? [],
    };
  });

  //    Then any staff who DON'T have a shift today but DO have an
  //    appointment on this date — otherwise their appointments would be
  //    silently dropped (the rendering layer only draws the shift staff
  //    columns), causing "予約が消えた!" bugs and conflict errors when
  //    you try to book the same slot.
  const shiftStaffIds = new Set(staffs.map((s) => s.id));
  const orphanStaffIds = Array.from(
    new Set(
      (appointments ?? [])
        .map((a) => a.staff_id as number)
        .filter((id) => id != null && !shiftStaffIds.has(id))
    )
  );
  if (orphanStaffIds.length > 0) {
    const { data: extraStaffs } = await supabase
      .from("staffs")
      .select("id, name")
      .in("id", orphanStaffIds)
      .is("deleted_at", null);
    for (const s of extraStaffs ?? []) {
      const u = utilization.get(s.id as number);
      staffs.push({
        id: s.id as number,
        name: s.name as string,
        isWorking: false,
        shiftStart: null,
        shiftEnd: null,
        shiftColor: null,
        utilizationRate: u && u.openMin > 0 ? u.rate : null,
        openMin: u?.openMin ?? 0,
        busyMin: u?.busyMin ?? 0,
        utilizationContributions: u?.contributions ?? [],
      });
    }
  }

  // 5. 顧客ごとの「実際の来店順位」と「会員 (active customer_plans を持つか)」
  //    を集計する。
  //
  //    なぜ recompute するか:
  //    appointments.visit_count は createAppointment 時に customer.visit_count
  //    + 1 で stamp されるが、customer.visit_count は completeAppointment が
  //    呼ばれた時にしか加算されないため、
  //      - 1 回目が status=完了 になる前に 2 回目を予約 / 振替えた
  //      - 1 回目をキャンセル → 2 回目を予約
  //    といった運用フローでは「2 回目なのに stamped visit_count = 1」と
  //    なって新規バッジが誤表示される。 ← 5/8 18:00 赫 知子の事例。
  //    ここで全ての非キャンセル予約を start_at ASC で並べ直し、
  //    本予約のインデックス + 1 を「真の来店回数」として再計算する。
  const customerIds = Array.from(
    new Set(
      (appointments ?? [])
        .map((a) => a.customer_id as number | null)
        .filter((v): v is number => v != null)
    )
  );
  const visitOrderMap = new Map<number, string[]>(); // customer_id -> sorted ISO start_at list
  const activePlanCustomerIds = new Set<number>();
  if (customerIds.length > 0) {
    const [historyRes, plansRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("customer_id, start_at, status, type, is_continued_billing")
        .in("customer_id", customerIds)
        .is("deleted_at", null)
        .order("start_at"),
      supabase
        .from("customer_plans")
        .select("customer_id")
        .in("customer_id", customerIds)
        .eq("status", 0)
        .is("deleted_at", null),
    ]);
    type HistoryRow = {
      customer_id: number;
      start_at: string;
      status: number;
      type: number | null;
      is_continued_billing: boolean | null;
    };
    for (const row of (historyRes.data ?? []) as HistoryRow[]) {
      // 来店としてカウントしないもの: キャンセル / no-show / slot block /
      // 継続決済 (サブスク月次課金の幽霊予約)
      if (row.status === 3 || row.status === 4 || row.status === 99) continue;
      if (row.type !== 0) continue;
      if (row.is_continued_billing) continue;
      const arr = visitOrderMap.get(row.customer_id) ?? [];
      arr.push(row.start_at);
      visitOrderMap.set(row.customer_id, arr);
    }
    for (const row of (plansRes.data ?? []) as Array<{ customer_id: number }>) {
      activePlanCustomerIds.add(row.customer_id);
    }
  }

  // 5. Build appointment list
  const calendarAppointments: CalendarAppointment[] = (
    appointments ?? []
  ).map((a) => {
    // Supabase typegen sometimes returns the FK join as a single object,
    // sometimes as a 1-element array — normalize both shapes.
    const rawCustomer = a.customers;
    const customer = (Array.isArray(rawCustomer)
      ? rawCustomer[0] ?? null
      : rawCustomer) as
      | {
          code: string | null;
          last_name: string | null;
          first_name: string | null;
          phone_number_1: string | null;
          visit_count: number | null;
          created_at: string | null;
        }
      | null;
    const sourceInfo = a.visit_source_id
      ? sourceMap.get(a.visit_source_id as number)
      : null;
    const menu = menuMap.get(a.menu_manage_id) ?? null;
    // 真の来店回数: customer の非キャンセル・非 slot block 予約を
    // start_at ASC で並べ替えて、このレコードのインデックス + 1 を取る。
    // 該当しない場合 (= slot block, customer_id 無し) は stamped 値に
    // フォールバック。
    const stampedVisitCount =
      (a.visit_count as number | null) ?? customer?.visit_count ?? 0;
    let actualVisitNumber = stampedVisitCount;
    if (a.customer_id) {
      const order = visitOrderMap.get(a.customer_id as number);
      if (order) {
        const idx = order.indexOf(a.start_at);
        if (idx >= 0) actualVisitNumber = idx + 1;
      }
    }
    const apptVisitCount = actualVisitNumber;
    const hasActivePlan = a.customer_id
      ? activePlanCustomerIds.has(a.customer_id as number)
      : false;

    // 新規 = この予約が顧客の初回来店 (= history index 0)
    const isNewCustomer = actualVisitNumber === 1;
    // 2 回目 = まだ会員プランが無く、来店履歴が 2 番目
    const isSecondVisit = actualVisitNumber === 2 && !hasActivePlan;

    // Resolve slot block metadata once so the UI can render the row
    // as "ミーティング / 休憩 / その他" instead of the system-placeholder
    // customer name.
    const slotBlock = resolveSlotBlock(
      a.type,
      a.slot_block_type_code ?? null
    );

    return {
      id: a.id,
      staffId: a.staff_id,
      customerId: a.customer_id,
      menuManageId: a.menu_manage_id,
      customerName: customer
        ? `${customer.last_name ?? ""} ${customer.first_name ?? ""}`.trim()
        : "不明",
      customerCode: customer?.code ?? null,
      customerPhone: customer?.phone_number_1 ?? null,
      menuName: menu?.name ?? "不明",
      startAt: a.start_at,
      endAt: a.end_at,
      status: a.status,
      type: a.type,
      duration: menu?.duration ?? 0,
      memo: a.memo ?? null,
      isNewCustomer,
      isSecondVisit,
      hasActivePlan,
      visitCount: apptVisitCount,
      source: sourceInfo?.name ?? null,
      sourceColor: sourceInfo?.color ?? null,
      sourceTextColor: sourceInfo?.label_text_color ?? null,
      visitSourceId: a.visit_source_id ?? null,
      sales: a.sales ?? 0,
      additionalCharge: a.additional_charge ?? 0,
      paymentMethod: a.payment_method ?? null,
      paymentSplits: parsePaymentSplits(a.payment_splits),
      additionalChargeConsumeTiming:
        a.additional_charge_consume_timing === "today" ||
        a.additional_charge_consume_timing === "next"
          ? a.additional_charge_consume_timing
          : null,
      customerRecord: a.customer_record ?? null,
      isMemberJoin: !!a.is_member_join,
      isContinuedBilling: !!a.is_continued_billing,
      consumedPlanId: a.consumed_plan_id ?? null,
      consumedAmount: a.consumed_amount ?? 0,
      slotBlock: slotBlock
        ? {
            code: slotBlock.code,
            label: slotBlock.label,
            color: slotBlock.color,
            labelTextColor: slotBlock.labelTextColor,
          }
        : null,
      otherLabel: a.other_label ?? null,
    };
  });

  // 6. Generate time slots — fit the union of every working staff's
  //    shift hours plus any appointment that bleeds outside those bounds.
  //    Default 9–21 if there's nothing to anchor on.
  const timeSlots = generateTimeSlots(
    ...computeDayRange(staffs, appointments ?? []),
    frameMin
  );

  return {
    staffs,
    appointments: calendarAppointments,
    timeSlots,
    frameMin,
  };
}

/**
 * Returns [startHour, endHour] (whole hours) covering every working
 * staff's shift and any appointment in the appointments array.
 *
 * Rules:
 *  - Floor the earliest start to the hour (e.g. 8:30 → 8)
 *  - Ceil the latest end to the hour (e.g. 21:30 → 22)
 *  - Default to 9..21 when no anchor exists
 *  - Clamp to 0..24
 */
function computeDayRange(
  staffs: Array<{ isWorking: boolean; shiftStart: string | null; shiftEnd: string | null }>,
  appointments: Array<{ start_at: string | null; end_at: string | null }>
): [number, number] {
  let minMin: number | null = null;
  let maxMin: number | null = null;

  function consider(startHHMM: string | null | undefined, endHHMM: string | null | undefined) {
    if (startHHMM) {
      const h = Number(startHHMM.slice(0, 2));
      const m = Number(startHHMM.slice(3, 5));
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const v = h * 60 + m;
        minMin = minMin == null ? v : Math.min(minMin, v);
      }
    }
    if (endHHMM) {
      const h = Number(endHHMM.slice(0, 2));
      const m = Number(endHHMM.slice(3, 5));
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const v = h * 60 + m;
        maxMin = maxMin == null ? v : Math.max(maxMin, v);
      }
    }
  }

  for (const s of staffs) {
    if (!s.isWorking) continue;
    consider(s.shiftStart ?? null, s.shiftEnd ?? null);
  }
  for (const a of appointments) {
    consider(a.start_at?.slice(11, 16) ?? null, a.end_at?.slice(11, 16) ?? null);
  }

  if (minMin == null || maxMin == null) {
    // 営業時間外の「継続決済枠」も含めて 9:00 - 23:00 を返す。
    // デフォルト通常営業は 9-21 で、21 以降の 2h が 継続決済 (サブスク
    // 月次課金の幽霊予約を置く) フリー枠として使われる。
    return [9, 23];
  }
  // Floor start to hour, ceil end to hour. さらに末尾に 継続決済 枠
  // として +2h 伸ばして、スタッフが サブスク の月次課金を打ち込める
  // フリーゾーンを作る。24 時を上限にする。
  const startHour = Math.max(0, Math.floor(minMin / 60));
  const rawEndHour = Math.min(24, Math.ceil(maxMin / 60));
  const endHour = Math.min(24, rawEndHour + 2);
  if (endHour <= startHour) return [startHour, Math.min(24, startHour + 1)];
  return [startHour, endHour];
}
