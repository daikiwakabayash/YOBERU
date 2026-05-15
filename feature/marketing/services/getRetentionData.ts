"use server";

import { createClient } from "@/helper/lib/supabase/server";

/**
 * 継続管理 (リテンション分析).
 *
 * 「期間内に初回プラン購入をした顧客」をコホートとして、その後の
 * 更新 (= プラン追加購入) ・離反を集計する。
 *
 * トリガー = customer_plans レコード作成 (チケット / サブスクどちらも)。
 *   1 回目購入   = 顧客の人生最初の customer_plans
 *   2 回目購入〜 = 更新 (リテンション成功)
 *   離反       = 全プランが status=cancelled/exhausted で、active プランが無い状態
 *
 * 「サブスク何ヶ月継続したか」は、簡易計算として
 *   (最後のプラン活動日 - 1 回目購入日) を月数換算
 *   - active なら 「現在も継続中 → 今日まで」
 *   - 離反なら 「最終購入日まで」
 *
 * フィルタ:
 *   - 期間 (startDate / endDate): 1 回目購入日が範囲内の顧客だけ抽出
 *   - 媒体 (visitSourceId): 1 回目購入予約の visit_source で絞る
 *   - スタッフ (staffId): 1 回目購入予約の staff_id で絞る
 */

export type RetentionStatus = "active" | "churned";

export interface RetentionCustomerRow {
  customerId: number;
  customerCode: string | null;
  customerName: string;
  firstPurchaseAt: string;            // ISO
  firstPurchaseDate: string;          // YYYY-MM-DD
  firstStaffId: number | null;
  firstStaffName: string;
  firstVisitSourceId: number | null;
  firstVisitSourceName: string;
  firstPlanType: "ticket" | "subscription";
  firstPlanName: string;
  /** プラン購入回数 (1 回目含む) */
  purchaseCount: number;
  /** 回数券更新回数 (= 回数券プラン数 - 1)。サブスクのみの顧客は null */
  ticketRenewals: number | null;
  /** サブスク継続月数 (最初のサブスク購入から最終活動日まで)。回数券のみの顧客は null */
  subscriptionMonths: number | null;
  status: RetentionStatus;
  /** 「1 回で離反」「2 回で離反」「現在継続中 (N 回更新)」のような表記 */
  churnLabel: string;
  lastPurchaseAt: string;             // ISO
  totalSpent: number;                  // 全プランの price_snapshot 合計
}

export interface RetentionStaffRow {
  staffId: number;
  staffName: string;
  newJoinCount: number;
  activeCount: number;
  churnedCount: number;
  retentionRate: number;       // active / newJoin
  avgPurchaseCount: number;
}

export interface RetentionSourceRow {
  sourceId: number | null;
  sourceName: string;
  newJoinCount: number;
  activeCount: number;
  churnedCount: number;
  retentionRate: number;
}

export interface RetentionData {
  rows: RetentionCustomerRow[];
  totals: {
    newJoinCount: number;
    activeCount: number;
    churnedCount: number;
    retentionRate: number;
    avgPurchaseCount: number;
    /** サブスクのみで集計した平均継続月数 */
    avgSubscriptionMonths: number;
    /** 回数券のみで集計した平均更新回数 */
    avgTicketRenewals: number;
  };
  /** 「N 回購入で離反した人数」の分布 (active 含む / 含まないバージョン両方) */
  churnDistribution: Array<{
    purchaseCount: number;
    churnedCount: number;
    activeCount: number;
  }>;
  byStaff: RetentionStaffRow[];
  bySource: RetentionSourceRow[];
  meta: {
    startDate: string;
    endDate: string;
    shopId: number;
  };
}

function emptyData(
  shopId: number,
  startDate: string,
  endDate: string
): RetentionData {
  return {
    rows: [],
    totals: {
      newJoinCount: 0,
      activeCount: 0,
      churnedCount: 0,
      retentionRate: 0,
      avgPurchaseCount: 0,
      avgSubscriptionMonths: 0,
      avgTicketRenewals: 0,
    },
    churnDistribution: [],
    byStaff: [],
    bySource: [],
    meta: { startDate, endDate, shopId },
  };
}

function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diffMs = b.getTime() - a.getTime();
  if (diffMs <= 0) return 0;
  // 平均 30.4375 日 / 月 で換算 (月跨ぎを正確に数えるより、
  // ダッシュボード用途では十分)
  return Math.max(0, Math.round((diffMs / (1000 * 60 * 60 * 24 * 30.4375)) * 10) / 10);
}

export async function getRetentionData(params: {
  shopId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (inclusive)
  staffId?: number | null;
  visitSourceId?: number | null;
}): Promise<RetentionData> {
  const { shopId, startDate, endDate, staffId, visitSourceId } = params;
  const supabase = await createClient();

  // 1. 期間内の入会候補: 「期間内に customer_plans を購入した顧客」を抽出
  //    (= まだ 1 回目購入かどうかは絞れない。その後 customer_plans 全件
  //    取得して "顧客の最古プランが期間内にあるか" を判定する)
  const { data: periodPlans, error: ppErr } = await supabase
    .from("customer_plans")
    .select("customer_id")
    .eq("shop_id", shopId)
    .gte("purchased_at", `${startDate}T00:00:00+09:00`)
    .lte("purchased_at", `${endDate}T23:59:59+09:00`)
    .is("deleted_at", null);
  if (ppErr) return emptyData(shopId, startDate, endDate);

  const candidateCustomerIds = Array.from(
    new Set(
      (periodPlans ?? []).map((p) => p.customer_id as number).filter(Boolean)
    )
  );
  if (candidateCustomerIds.length === 0) {
    return emptyData(shopId, startDate, endDate);
  }

  // 2. 候補顧客の全期間 customer_plans を取得 (購入時系列)
  const { data: allPlansRaw } = await supabase
    .from("customer_plans")
    .select(
      "id, customer_id, purchased_appointment_id, purchased_at, plan_type, status, menu_name_snapshot, price_snapshot, total_count, used_count, next_billing_date"
    )
    .in("customer_id", candidateCustomerIds)
    .is("deleted_at", null)
    .order("purchased_at", { ascending: true });

  type PlanRow = {
    id: number;
    customer_id: number;
    purchased_appointment_id: number | null;
    purchased_at: string;
    plan_type: "ticket" | "subscription";
    status: number;          // 0=active, 1=exhausted, 2=cancelled
    menu_name_snapshot: string | null;
    price_snapshot: number | null;
    total_count: number | null;
    used_count: number;
    next_billing_date: string | null;
  };
  const allPlans = (allPlansRaw ?? []) as PlanRow[];

  // customer_id → plans (時系列)
  const plansByCustomer = new Map<number, PlanRow[]>();
  for (const p of allPlans) {
    const arr = plansByCustomer.get(p.customer_id) ?? [];
    arr.push(p);
    plansByCustomer.set(p.customer_id, arr);
  }

  // 3. 「最古プランが期間内」の顧客だけを残す
  const startTs = `${startDate}T00:00:00+09:00`;
  const endTs = `${endDate}T23:59:59+09:00`;
  const cohortCustomerIds: number[] = [];
  for (const [cid, plans] of plansByCustomer.entries()) {
    if (plans.length === 0) continue;
    const firstAt = plans[0].purchased_at;
    if (firstAt >= startTs && firstAt <= endTs) {
      cohortCustomerIds.push(cid);
    }
  }
  if (cohortCustomerIds.length === 0) {
    return emptyData(shopId, startDate, endDate);
  }

  // 4. 顧客 / 1 回目購入予約 (= staff / visit_source) のルックアップ
  const firstApptIds = cohortCustomerIds
    .map((cid) => plansByCustomer.get(cid)?.[0]?.purchased_appointment_id ?? null)
    .filter((id): id is number => id != null);

  const [customersRes, apptsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, last_name, first_name, first_visit_source_id")
      .in("id", cohortCustomerIds),
    firstApptIds.length
      ? supabase
          .from("appointments")
          .select("id, staff_id, visit_source_id")
          .in("id", firstApptIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  type CustomerRow = {
    id: number;
    code: string | null;
    last_name: string | null;
    first_name: string | null;
    first_visit_source_id: number | null;
  };
  const customerById = new Map<number, CustomerRow>();
  for (const c of (customersRes.data ?? []) as CustomerRow[]) {
    customerById.set(c.id, c);
  }
  type ApptRow = {
    id: number;
    staff_id: number | null;
    visit_source_id: number | null;
  };
  const apptById = new Map<number, ApptRow>();
  for (const a of (apptsRes.data ?? []) as ApptRow[]) {
    apptById.set(a.id, a);
  }

  // 1 回目購入予約 / customers.first_visit_source_id どちらも null だった
  // 顧客について、最後のフォールバックとして「その顧客の予約のうち
  // visit_source_id が non-null な最古の予約」から拾う。
  const fallbackNeeded: number[] = [];
  for (const cid of cohortCustomerIds) {
    const firstPlan = plansByCustomer.get(cid)?.[0];
    const appt =
      firstPlan?.purchased_appointment_id != null
        ? apptById.get(firstPlan.purchased_appointment_id)
        : undefined;
    if (appt?.visit_source_id != null) continue;
    if (customerById.get(cid)?.first_visit_source_id != null) continue;
    fallbackNeeded.push(cid);
  }
  const fallbackSourceByCustomer = new Map<number, number>();
  if (fallbackNeeded.length > 0) {
    const { data: fallbackRows } = await supabase
      .from("appointments")
      .select("customer_id, visit_source_id, start_at")
      .eq("shop_id", shopId)
      .in("customer_id", fallbackNeeded)
      .not("visit_source_id", "is", null)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    for (const r of (fallbackRows ?? []) as Array<{
      customer_id: number;
      visit_source_id: number | null;
      start_at: string;
    }>) {
      if (r.visit_source_id == null) continue;
      if (!fallbackSourceByCustomer.has(r.customer_id)) {
        fallbackSourceByCustomer.set(r.customer_id, r.visit_source_id);
      }
    }
  }

  // staff / visit_source 名前ルックアップ。フォールバック経路
  // (customers.first_visit_source_id / 最古の non-null 予約) も含めて
  // すべての候補 id を集める。
  const staffIds = Array.from(
    new Set(
      Array.from(apptById.values())
        .map((a) => a.staff_id)
        .filter((id): id is number => id != null)
    )
  );
  const sourceIdSet = new Set<number>();
  for (const a of apptById.values()) {
    if (a.visit_source_id != null) sourceIdSet.add(a.visit_source_id);
  }
  for (const c of customerById.values()) {
    if (c.first_visit_source_id != null) sourceIdSet.add(c.first_visit_source_id);
  }
  for (const sid of fallbackSourceByCustomer.values()) sourceIdSet.add(sid);
  const sourceIds = Array.from(sourceIdSet);
  const [staffsRes, sourcesRes] = await Promise.all([
    staffIds.length
      ? supabase.from("staffs").select("id, name").in("id", staffIds)
      : Promise.resolve({ data: [], error: null } as const),
    sourceIds.length
      ? supabase.from("visit_sources").select("id, name").in("id", sourceIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  const staffName = new Map<number, string>();
  for (const s of (staffsRes.data ?? []) as Array<{ id: number; name: string }>)
    staffName.set(s.id, s.name);
  const sourceName = new Map<number, string>();
  for (const s of (sourcesRes.data ?? []) as Array<{ id: number; name: string }>)
    sourceName.set(s.id, s.name);

  // 5. 顧客行を組み立て + フィルタ
  const todayIso = new Date().toISOString();
  const rows: RetentionCustomerRow[] = [];
  for (const cid of cohortCustomerIds) {
    const plans = plansByCustomer.get(cid) ?? [];
    if (plans.length === 0) continue;
    const firstPlan = plans[0];
    const lastPlan = plans[plans.length - 1];
    const cust = customerById.get(cid);
    const appt =
      firstPlan.purchased_appointment_id != null
        ? apptById.get(firstPlan.purchased_appointment_id)
        : undefined;

    // 媒体は次の優先順位で解決:
    //   1. 1 回目購入予約の visit_source_id
    //   2. customers.first_visit_source_id (初回来店経路)
    //   3. その顧客の visit_source_id が non-null な最古の予約
    const resolvedSourceId =
      appt?.visit_source_id ??
      cust?.first_visit_source_id ??
      fallbackSourceByCustomer.get(cid) ??
      null;

    // フィルタ: 1 回目購入予約の staff / 解決後の visit_source で絞る
    if (staffId != null && appt?.staff_id !== staffId) continue;
    if (visitSourceId != null && resolvedSourceId !== visitSourceId) continue;

    const hasActive = plans.some((p) => p.status === 0);
    const status: RetentionStatus = hasActive ? "active" : "churned";

    const ticketCount = plans.filter((p) => p.plan_type === "ticket").length;
    const subCount = plans.filter((p) => p.plan_type === "subscription").length;

    const purchaseCount = plans.length;
    const ticketRenewals = ticketCount > 0 ? Math.max(0, ticketCount - 1) : null;

    // サブスク継続月数: 最初のサブスク購入から、最終活動 (active なら今日 /
    // churned なら最終プランの purchased_at) までの月数
    let subscriptionMonths: number | null = null;
    if (subCount > 0) {
      const firstSub = plans.find((p) => p.plan_type === "subscription");
      if (firstSub) {
        const endIso = hasActive ? todayIso : lastPlan.purchased_at;
        subscriptionMonths = monthsBetween(firstSub.purchased_at, endIso);
      }
    }

    // 「N 回で離反」表記
    let churnLabel = "";
    if (status === "active") {
      churnLabel =
        purchaseCount === 1
          ? "1 回目 (継続中)"
          : `${purchaseCount} 回更新 (継続中)`;
    } else {
      churnLabel =
        purchaseCount === 1
          ? "1 回で離反"
          : `${purchaseCount} 回で離反`;
    }

    const totalSpent = plans.reduce((s, p) => s + (p.price_snapshot ?? 0), 0);

    rows.push({
      customerId: cid,
      customerCode: cust?.code ?? null,
      customerName: cust
        ? `${cust.last_name ?? ""} ${cust.first_name ?? ""}`.trim()
        : "(不明)",
      firstPurchaseAt: firstPlan.purchased_at,
      firstPurchaseDate: firstPlan.purchased_at.slice(0, 10),
      firstStaffId: appt?.staff_id ?? null,
      firstStaffName:
        appt?.staff_id != null
          ? staffName.get(appt.staff_id) ?? "(不明)"
          : "",
      firstVisitSourceId: resolvedSourceId,
      firstVisitSourceName:
        resolvedSourceId != null
          ? sourceName.get(resolvedSourceId) ?? ""
          : "",
      firstPlanType: firstPlan.plan_type,
      firstPlanName: firstPlan.menu_name_snapshot ?? "(不明プラン)",
      purchaseCount,
      ticketRenewals,
      subscriptionMonths,
      status,
      churnLabel,
      lastPurchaseAt: lastPlan.purchased_at,
      totalSpent,
    });
  }

  // 6. 集計
  const newJoinCount = rows.length;
  const activeCount = rows.filter((r) => r.status === "active").length;
  const churnedCount = newJoinCount - activeCount;
  const retentionRate = newJoinCount > 0 ? activeCount / newJoinCount : 0;
  const avgPurchaseCount =
    newJoinCount > 0
      ? rows.reduce((s, r) => s + r.purchaseCount, 0) / newJoinCount
      : 0;
  const subRows = rows.filter((r) => r.subscriptionMonths != null);
  const avgSubscriptionMonths =
    subRows.length > 0
      ? subRows.reduce((s, r) => s + (r.subscriptionMonths ?? 0), 0) /
        subRows.length
      : 0;
  const ticketRows = rows.filter((r) => r.ticketRenewals != null);
  const avgTicketRenewals =
    ticketRows.length > 0
      ? ticketRows.reduce((s, r) => s + (r.ticketRenewals ?? 0), 0) /
        ticketRows.length
      : 0;

  // churn 分布
  const churnMap = new Map<
    number,
    { churnedCount: number; activeCount: number }
  >();
  for (const r of rows) {
    const cur = churnMap.get(r.purchaseCount) ?? {
      churnedCount: 0,
      activeCount: 0,
    };
    if (r.status === "active") cur.activeCount += 1;
    else cur.churnedCount += 1;
    churnMap.set(r.purchaseCount, cur);
  }
  const churnDistribution = Array.from(churnMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([purchaseCount, v]) => ({
      purchaseCount,
      churnedCount: v.churnedCount,
      activeCount: v.activeCount,
    }));

  // スタッフ別
  const staffBuckets = new Map<
    number,
    { staffId: number; staffName: string; rows: RetentionCustomerRow[] }
  >();
  for (const r of rows) {
    if (r.firstStaffId == null) continue;
    const b = staffBuckets.get(r.firstStaffId) ?? {
      staffId: r.firstStaffId,
      staffName: r.firstStaffName,
      rows: [],
    };
    b.rows.push(r);
    staffBuckets.set(r.firstStaffId, b);
  }
  const byStaff: RetentionStaffRow[] = Array.from(staffBuckets.values())
    .map((b) => {
      const active = b.rows.filter((r) => r.status === "active").length;
      const total = b.rows.length;
      return {
        staffId: b.staffId,
        staffName: b.staffName,
        newJoinCount: total,
        activeCount: active,
        churnedCount: total - active,
        retentionRate: total > 0 ? active / total : 0,
        avgPurchaseCount:
          total > 0 ? b.rows.reduce((s, r) => s + r.purchaseCount, 0) / total : 0,
      };
    })
    .sort((a, b) => b.retentionRate - a.retentionRate);

  // 媒体別
  const sourceBuckets = new Map<
    number,
    { sourceId: number; sourceName: string; rows: RetentionCustomerRow[] }
  >();
  const noSourceBucket: RetentionCustomerRow[] = [];
  for (const r of rows) {
    if (r.firstVisitSourceId == null) {
      noSourceBucket.push(r);
      continue;
    }
    const b = sourceBuckets.get(r.firstVisitSourceId) ?? {
      sourceId: r.firstVisitSourceId,
      sourceName: r.firstVisitSourceName || `#${r.firstVisitSourceId}`,
      rows: [],
    };
    b.rows.push(r);
    sourceBuckets.set(r.firstVisitSourceId, b);
  }
  const bySource: RetentionSourceRow[] = Array.from(sourceBuckets.values())
    .map((b) => {
      const active = b.rows.filter((r) => r.status === "active").length;
      const total = b.rows.length;
      return {
        sourceId: b.sourceId,
        sourceName: b.sourceName,
        newJoinCount: total,
        activeCount: active,
        churnedCount: total - active,
        retentionRate: total > 0 ? active / total : 0,
      };
    })
    .sort((a, b) => b.newJoinCount - a.newJoinCount);
  if (noSourceBucket.length > 0) {
    const active = noSourceBucket.filter((r) => r.status === "active").length;
    bySource.push({
      sourceId: null,
      sourceName: "(媒体未設定)",
      newJoinCount: noSourceBucket.length,
      activeCount: active,
      churnedCount: noSourceBucket.length - active,
      retentionRate:
        noSourceBucket.length > 0 ? active / noSourceBucket.length : 0,
    });
  }

  // ソート: 顧客一覧は 1 回目購入日 降順
  rows.sort((a, b) => b.firstPurchaseAt.localeCompare(a.firstPurchaseAt));

  return {
    rows,
    totals: {
      newJoinCount,
      activeCount,
      churnedCount,
      retentionRate,
      avgPurchaseCount,
      avgSubscriptionMonths,
      avgTicketRenewals,
    },
    churnDistribution,
    byStaff,
    bySource,
    meta: { startDate, endDate, shopId },
  };
}
