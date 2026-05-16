"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";
import { getRangeStaffUtilization } from "./getStaffUtilization";

interface SalesData {
  totalSales: number;
  totalCount: number;
  newCustomerSales: number;
  newCustomerCount: number;
  existingCustomerSales: number;
  existingCustomerCount: number;
  /**
   * 消化売上: 前金で販売したチケット/サブスクが、実際に来店で
   * 消化された分の合計 (円)。会計額 (totalSales) とは別軸で、
   * 前金前受金を「サービス提供時点の売上」として認識する指標。
   */
  consumedSales: number;
  /** consumed_amount > 0 だった予約の件数 */
  consumedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  staffSales: Array<{
    staffId: number;
    staffName: string;
    sales: number;
    count: number;
    /** 施術数 = status 1/2 かつ type=0 のみ (ミーティング/キャンセル除外) */
    treatmentCount: number;
    /** 新規数 = 顧客の人生最古の status=2 完了予約 (true new attribution)。
     *  期間内にその完了予約が含まれていれば 1 加算。visit_count スタンプに
     *  は依存しない (キャンセル後の再スタンプで誤計上されるのを防ぐ)。 */
    newCount: number;
    /** スタッフ別消化売上 (完了予約) */
    consumedSales: number;
    /** 期間内の総開放時間 (= シフト合計、分単位) */
    openMin: number;
    /** 期間内の稼働時間 (status 1/2 のみ、分単位) */
    busyMin: number;
    /** 0..1, 0 when openMin === 0 */
    utilizationRate: number;
  }>;
}

/**
 * Get sales summary for a date range, optionally scoped to a single staff.
 *
 * When `staffId` is given the query is filtered to that staff only — all
 * downstream aggregation (new/existing split, staff rankings) still works
 * and the returned `staffSales` will contain a single row for that staff.
 */
export async function getSalesSummary(
  shopId: number,
  startDate: string,
  endDate: string,
  staffId?: number | null
): Promise<SalesData> {
  const supabase = await createClient();
  const nextDate = new Date(endDate + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  let query = supabase
    .from("appointments")
    .select(
      "id, staff_id, customer_id, sales, consumed_amount, additional_charge, additional_charge_consume_timing, status, type, visit_count, cancelled_at, staffs(name)"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null);
  if (staffId) {
    query = query.eq("staff_id", staffId);
  }
  const { data: appointments } = await query;

  const appts = appointments ?? [];

  const completed = appts.filter((a) => a.status === 2);
  const cancelled = appts.filter(
    (a) => a.status === 3 || a.cancelled_at
  );
  const noShow = appts.filter((a) => a.status === 99);

  const totalSales = completed.reduce((sum, a) => sum + (a.sales || 0), 0);
  const totalCount = completed.length;

  // プラン購入価格を appointment 単位で集計 (完了予約のみ対象)
  //   消化売上 = sales + consumed_amount - plan_purchase_price
  // プラン購入分は前受金なので消化から除外。詳細な意図は getDailyReport
  // の同名ロジックを参照。
  const completedIds = completed.map((a) => a.id as number);
  const planPurchasePriceByApptId = new Map<number, number>();
  if (completedIds.length > 0) {
    const { data: plansBoughtHere } = await supabase
      .from("customer_plans")
      .select("purchased_appointment_id, price_snapshot")
      .in("purchased_appointment_id", completedIds)
      .is("deleted_at", null);
    for (const p of (plansBoughtHere ?? []) as Array<{
      purchased_appointment_id: number;
      price_snapshot: number | null;
    }>) {
      if (!p.purchased_appointment_id) continue;
      planPurchasePriceByApptId.set(
        p.purchased_appointment_id,
        (planPurchasePriceByApptId.get(p.purchased_appointment_id) ?? 0) +
          (p.price_snapshot ?? 0)
      );
    }
  }

  // 追加料金「次回で消化」のキャリーオーバー: 期間内の顧客の完了予約を
  // 顧客 × 時系列で並べ、X (timing='next') → 次の Y に持ち越す。
  // 詳細は getDailyReport の同名ロジック参照。
  type CompletedLite = {
    id: number;
    customer_id: number;
    additional_charge: number | null;
    additional_charge_consume_timing: string | null;
  };
  const completedCustomerIds = Array.from(
    new Set(
      completed
        .map((a) => (a as unknown as { customer_id: number }).customer_id)
        .filter((v): v is number => typeof v === "number")
    )
  );
  const deferredAppliedByApptId = new Map<number, number>();
  if (completedCustomerIds.length > 0) {
    const { data: histRows } = await supabase
      .from("appointments")
      .select(
        "id, customer_id, start_at, additional_charge, additional_charge_consume_timing"
      )
      .eq("shop_id", shopId)
      .in("customer_id", completedCustomerIds)
      .eq("status", 2)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    const byCustomer = new Map<number, CompletedLite[]>();
    for (const r of (histRows ?? []) as CompletedLite[]) {
      const arr = byCustomer.get(r.customer_id) ?? [];
      arr.push(r);
      byCustomer.set(r.customer_id, arr);
    }
    for (const [, list] of byCustomer) {
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (
          r.additional_charge_consume_timing === "next" &&
          (r.additional_charge ?? 0) > 0
        ) {
          const next = list[i + 1];
          if (next) {
            deferredAppliedByApptId.set(
              next.id,
              (deferredAppliedByApptId.get(next.id) ?? 0) +
                (r.additional_charge ?? 0)
            );
          }
        }
      }
    }
  }

  function consumedSalesForAppt(a: {
    id: number;
    sales: number | null;
    consumed_amount: number | null;
    additional_charge: number | null;
    additional_charge_consume_timing: string | null;
  }): number {
    const planPurchasePrice =
      planPurchasePriceByApptId.get(a.id) ?? 0;
    const deferredOut =
      a.additional_charge_consume_timing === "next"
        ? a.additional_charge ?? 0
        : 0;
    const deferredApplied = deferredAppliedByApptId.get(a.id) ?? 0;
    return Math.max(
      0,
      (a.sales ?? 0) +
        (a.consumed_amount ?? 0) -
        planPurchasePrice -
        deferredOut +
        deferredApplied
    );
  }

  // 消化売上 = 当日に「実サービス提供価値」として認識すべき金額の合計。
  // sales (当日入金) + consumed_amount (プラン按分) から plan_purchase_price
  // (前受金) を引く。通常メニュー / 追加料金もそのまま当日の消化として計上。
  const consumedSales = completed.reduce(
    (sum, a) =>
      sum +
      consumedSalesForAppt({
        id: a.id as number,
        sales: a.sales as number | null,
        consumed_amount: a.consumed_amount as number | null,
        additional_charge: (a as { additional_charge: number | null })
          .additional_charge,
        additional_charge_consume_timing: (a as {
          additional_charge_consume_timing: string | null;
        }).additional_charge_consume_timing,
      }),
    0
  );
  const consumedCount = completed.filter(
    (a) =>
      consumedSalesForAppt({
        id: a.id as number,
        sales: a.sales as number | null,
        consumed_amount: a.consumed_amount as number | null,
        additional_charge: (a as { additional_charge: number | null })
          .additional_charge,
        additional_charge_consume_timing: (a as {
          additional_charge_consume_timing: string | null;
        }).additional_charge_consume_timing,
      }) > 0
  ).length;

  // 新規/既存 売上の分類: 新規 attribution は「顧客の人生最古 status=2
  // 予約 id」一致のもの。それ以外の status=2 完了は既存売上として扱う。
  // (実際の Map は下のヒストリ取得後に確定するので、ここではプレース
  //  ホルダーを置いておく)
  let newCustomerAppts: typeof completed = [];
  let existingCustomerAppts: typeof completed = completed;

  // Staff breakdown (completed appointments for sales/count) + treatment
  // count (status 1/2, type=0 — actual 施術 only) + new customer count.
  const staffMap = new Map<
    number,
    {
      staffName: string;
      sales: number;
      count: number;
      treatmentCount: number;
      newCount: number;
      consumedSales: number;
    }
  >();

  function getOrCreateStaff(
    sId: number,
    name: string
  ) {
    let row = staffMap.get(sId);
    if (!row) {
      row = {
        staffName: name,
        sales: 0,
        count: 0,
        treatmentCount: 0,
        newCount: 0,
        consumedSales: 0,
      };
      staffMap.set(sId, row);
    }
    return row;
  }

  // Pass 1: completed appointments → sales / count / consumed
  for (const appt of completed) {
    const staffData = appt.staffs as unknown as { name: string } | null;
    const row = getOrCreateStaff(
      appt.staff_id,
      staffData?.name ?? "不明"
    );
    row.sales += appt.sales || 0;
    row.count += 1;
    row.consumedSales += consumedSalesForAppt({
      id: appt.id as number,
      sales: appt.sales as number | null,
      consumed_amount: appt.consumed_amount as number | null,
      additional_charge: (appt as { additional_charge: number | null })
        .additional_charge,
      additional_charge_consume_timing: (appt as {
        additional_charge_consume_timing: string | null;
      }).additional_charge_consume_timing,
    });
  }

  // 新規 attribution: 期間内の予約に含まれる顧客の「人生最古の status=2
  // 完了予約 id」を求め、その id が期間内予約にあれば新規 1 件として
  // カウントする。visit_count スタンプは「初回キャンセル → 2 回目で再
  // スタンプ」のケースで誤計上を起こすので使わない (新患管理・概要・
  // 経営指標と統一)。
  const customerIdsInRange = Array.from(
    new Set(
      appts
        .map((a) => a.customer_id as number | null)
        .filter((id): id is number => id != null)
    )
  );
  const firstCompletedApptIdByCustomer = new Map<number, number>();
  if (customerIdsInRange.length > 0) {
    const { data: histRows } = await supabase
      .from("appointments")
      .select("id, customer_id, start_at")
      .eq("shop_id", shopId)
      .eq("status", 2)
      .in("customer_id", customerIdsInRange)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    for (const r of (histRows ?? []) as Array<{
      id: number;
      customer_id: number;
      start_at: string;
    }>) {
      if (!firstCompletedApptIdByCustomer.has(r.customer_id)) {
        firstCompletedApptIdByCustomer.set(r.customer_id, r.id);
      }
    }
  }

  // 期間内 完了予約を「新規 (= 顧客の人生最古完了 id 一致)」と
  // 「既存 (それ以外)」に分割。
  newCustomerAppts = completed.filter((a) => {
    const cId = a.customer_id as number | null;
    return (
      cId != null &&
      firstCompletedApptIdByCustomer.get(cId) === (a.id as number)
    );
  });
  existingCustomerAppts = completed.filter((a) => {
    const cId = a.customer_id as number | null;
    return (
      cId == null ||
      firstCompletedApptIdByCustomer.get(cId) !== (a.id as number)
    );
  });

  // Pass 2: treatment count + new count. Includes status 1 (施術中) AND
  // status 2 (完了), but only type=0 (通常予約). Excludes meetings,
  // breaks, cancels, no-shows.
  for (const appt of appts) {
    const isCustomerAppt = (appt.type as number) === 0;
    const isTreatment =
      isCustomerAppt && ((appt.status as number) === 1 || (appt.status as number) === 2);
    if (!isTreatment) continue;

    const staffData = appt.staffs as unknown as { name: string } | null;
    const row = getOrCreateStaff(
      appt.staff_id as number,
      staffData?.name ?? "不明"
    );
    row.treatmentCount += 1;
    const cId = appt.customer_id as number | null;
    if (cId != null && firstCompletedApptIdByCustomer.get(cId) === (appt.id as number)) {
      row.newCount += 1;
    }
  }

  // Range utilization (open / busy / rate) — same date range, optionally
  // narrowed to the same staff filter the page is using.
  const utilizationByStaff = await getRangeStaffUtilization(
    shopId,
    startDate,
    endDate,
    staffId ?? null
  ).catch(() => new Map<number, { openMin: number; busyMin: number; rate: number }>());

  // Merge utilization rows that have NO sales-completed appointment so
  // staff who worked but had everything cancelled (rare) still appear.
  for (const [sId, u] of utilizationByStaff.entries()) {
    if (!staffMap.has(sId) && u.openMin > 0) {
      staffMap.set(sId, {
        staffName: "(staff #" + sId + ")",
        sales: 0,
        count: 0,
        treatmentCount: 0,
        newCount: 0,
        consumedSales: 0,
      });
    }
  }

  return {
    totalSales,
    totalCount,
    newCustomerSales: newCustomerAppts.reduce(
      (sum, a) => sum + (a.sales || 0),
      0
    ),
    newCustomerCount: newCustomerAppts.length,
    existingCustomerSales: existingCustomerAppts.reduce(
      (sum, a) => sum + (a.sales || 0),
      0
    ),
    existingCustomerCount: existingCustomerAppts.length,
    consumedSales,
    consumedCount,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    noShowCount: noShow.length,
    staffSales: Array.from(staffMap.entries())
      .map(([sId, data]) => {
        const u = utilizationByStaff.get(sId);
        return {
          staffId: sId,
          ...data,
          openMin: u?.openMin ?? 0,
          busyMin: u?.busyMin ?? 0,
          utilizationRate: u && u.openMin > 0 ? u.rate : 0,
        };
      })
      .sort((a, b) => b.sales - a.sales),
  };
}
