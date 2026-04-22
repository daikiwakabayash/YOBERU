"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

/**
 * 新規管理タブ用の集計サービス。
 *
 * 「当月に初回来店した顧客」を単位に、入会・離反・初回〜5回目までの
 * 来店記録を 1 ページで見せるためのデータを返す。attribution rule は
 * "初回来店月"。2 回目以降の来店が翌月でも、初回来店月の行に合算する。
 *
 * 新規客 = appointments.visit_count = 1 (reservationActions でスタンプ)
 */

const MAX_VISIT_COLUMNS = 20;
const PLAN_PREFIX = "BRD-PLAN-";

/** 各来院セルに付けるマーカー種別。
 *  - member_join : appointments.is_member_join=TRUE だがプラン購入履歴無し
 *                  (在庫上チケット/サブスク以外の入会フラグ) のケース
 *  - ticket      : この来院時に回数券プランを購入
 *  - subscription: この来院時にサブスクプランを購入 */
export type VisitMarker = "member_join" | "ticket" | "subscription" | null;

export interface NewCustomerVisit {
  date: string; // YYYY-MM-DD (Asia/Tokyo)
  sales: number;
  status: number;
  isMemberJoin: boolean;
  isCancel: boolean;
  /** 入会 / 回数券購入 / サブスク購入 を区別するマーカー。
   *  UI 側でこの値を見て金額セルに色付きバッジを出す。 */
  marker: VisitMarker;
}

export interface NewCustomerRow {
  customerId: number;
  code: string | null; // カルテNo
  name: string; // 氏名
  staffId: number | null;
  staffName: string | null;
  visitSourceId: number | null;
  visitSourceName: string | null;
  planName: string | null; // BRD-PLAN-* メニュー名、無ければ null
  isMemberJoin: boolean;
  isChurned: boolean; // 未来予約がない
  /** この顧客が合計で購入 (入会 / 回数券 / サブスク) した回数。
   *  マーカー付き visit の数を集計したもの。 */
  purchaseCount: number;
  visits: NewCustomerVisit[]; // 最大 MAX_VISIT_COLUMNS 件
}

export interface NewCustomerStaffBucket {
  staffId: number | null; // null = 全体
  staffName: string;
  newCount: number;
  joinCount: number;
  joinRate: number;
  memberUnitPrice: number;
  memberTotal: number;
  salesByVisitIndex: number[]; // [1回目, 2回目, 3回目]
  newCustomerSalesTotal: number; // 1+2+3回目
}

export interface NewCustomerAnalytics {
  yearMonth: string;
  rows: NewCustomerRow[];
  byStaff: NewCustomerStaffBucket[]; // 先頭: 全体
  sales: {
    newSales: number; // 当月 visit_count = 1 の完了 sales
    existingSales: number; // 当月 visit_count > 1 の完了 sales
    totalSales: number;
  };
}

interface ApptRow {
  id: number;
  customer_id: number;
  staff_id: number | null;
  visit_source_id: number | null;
  menu_manage_id: string | null;
  start_at: string;
  status: number;
  sales: number | null;
  is_member_join: boolean | null;
  visit_count: number | null;
}

function emptyStaffBucket(
  staffId: number | null,
  staffName: string
): NewCustomerStaffBucket {
  return {
    staffId,
    staffName,
    newCount: 0,
    joinCount: 0,
    joinRate: 0,
    memberUnitPrice: 0,
    memberTotal: 0,
    salesByVisitIndex: [0, 0, 0],
    newCustomerSalesTotal: 0,
  };
}

function finalizeBucket(b: NewCustomerStaffBucket): NewCustomerStaffBucket {
  const joinRate = b.newCount > 0 ? b.joinCount / b.newCount : 0;
  const memberUnitPrice =
    b.joinCount > 0 ? b.memberTotal / b.joinCount : 0;
  const newCustomerSalesTotal = b.salesByVisitIndex.reduce(
    (a, c) => a + c,
    0
  );
  return {
    ...b,
    joinRate,
    memberUnitPrice,
    newCustomerSalesTotal,
  };
}

function customerFullName(
  last: string | null | undefined,
  first: string | null | undefined
): string {
  const ln = (last ?? "").trim();
  const fn = (first ?? "").trim();
  if (!ln && !fn) return "(名無し)";
  if (!ln) return fn;
  if (!fn) return ln;
  return `${ln} ${fn}`;
}

function isCancelStatus(s: number): boolean {
  return s === 3 || s === 4 || s === 99;
}

export async function getNewCustomerAnalytics(params: {
  shopId: number;
  yearMonth: string; // 'YYYY-MM'
}): Promise<NewCustomerAnalytics> {
  const { shopId, yearMonth } = params;
  const supabase = await createClient();

  // Asia/Tokyo 境界で当月の開始 / 翌月の開始を決める。
  const [y, m] = yearMonth.split("-").map(Number);
  const startTs = `${yearMonth}-01T00:00:00+09:00`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const endTsExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;

  // 1. 当月の初回来店 appointments。
  const firstVisitRes = await supabase
    .from("appointments")
    .select(
      "id, customer_id, staff_id, visit_source_id, menu_manage_id, start_at, status, sales, is_member_join, visit_count"
    )
    .eq("shop_id", shopId)
    .eq("visit_count", 1)
    .gte("start_at", startTs)
    .lt("start_at", endTsExclusive)
    .is("deleted_at", null)
    .order("start_at", { ascending: true });

  const firstVisits = (firstVisitRes.data ?? []) as ApptRow[];

  if (firstVisits.length === 0) {
    // 何もない月でも 既存売上 だけは出したいので続行する。
    const existingRes = await supabase
      .from("appointments")
      .select("sales, status, visit_count")
      .eq("shop_id", shopId)
      .eq("status", 2)
      .gte("start_at", startTs)
      .lt("start_at", endTsExclusive)
      .is("deleted_at", null);
    const existingSales = (existingRes.data ?? [])
      .filter((r) => (r.visit_count ?? 0) > 1)
      .reduce((sum, r) => sum + (r.sales ?? 0), 0);
    return {
      yearMonth,
      rows: [],
      byStaff: [finalizeBucket(emptyStaffBucket(null, "全体"))],
      sales: {
        newSales: 0,
        existingSales,
        totalSales: existingSales,
      },
    };
  }

  const customerIds = Array.from(new Set(firstVisits.map((a) => a.customer_id)));
  const staffIds = Array.from(
    new Set(
      firstVisits
        .map((a) => a.staff_id)
        .filter((x): x is number => typeof x === "number")
    )
  );
  const sourceIds = Array.from(
    new Set(
      firstVisits
        .map((a) => a.visit_source_id)
        .filter((x): x is number => typeof x === "number")
    )
  );

  // 2. 該当 customer_id の全 appointments、当月全体の既存売上用、
  //    customer_plans 購入履歴、参照 master を並列取得。
  const [
    allApptsRes,
    monthApptsRes,
    customersRes,
    staffsRes,
    sourcesRes,
    menusRes,
    plansRes,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, customer_id, staff_id, visit_source_id, menu_manage_id, start_at, status, sales, is_member_join, visit_count"
      )
      .eq("shop_id", shopId)
      .in("customer_id", customerIds)
      .is("deleted_at", null)
      .order("start_at", { ascending: true }),
    supabase
      .from("appointments")
      .select("sales, visit_count, status")
      .eq("shop_id", shopId)
      .eq("status", 2)
      .gte("start_at", startTs)
      .lt("start_at", endTsExclusive)
      .is("deleted_at", null),
    supabase
      .from("customers")
      .select("id, code, last_name, first_name")
      .in("id", customerIds),
    staffIds.length
      ? supabase.from("staffs").select("id, name").in("id", staffIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }> }),
    sourceIds.length
      ? supabase
          .from("visit_sources")
          .select("id, name")
          .in("id", sourceIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }> }),
    supabase
      .from("menus")
      .select("menu_manage_id, name")
      .like("menu_manage_id", `${PLAN_PREFIX}%`)
      .is("deleted_at", null),
    // customer_plans は「どの予約の日にプランを購入したか」を追うために
    // purchased_appointment_id を含めて取る。ticket / subscription の
    // 区別もここから取って visit セルのマーカーに反映する。
    supabase
      .from("customer_plans")
      .select("customer_id, plan_type, purchased_appointment_id")
      .in("customer_id", customerIds)
      .is("deleted_at", null),
  ]);

  const allAppts = (allApptsRes.data ?? []) as ApptRow[];
  const monthAppts = (monthApptsRes.data ?? []) as Array<{
    sales: number | null;
    visit_count: number | null;
    status: number;
  }>;

  const customerMap = new Map<
    number,
    { code: string | null; last_name: string | null; first_name: string | null }
  >();
  for (const c of customersRes.data ?? []) {
    customerMap.set(c.id as number, {
      code: (c.code as string | null) ?? null,
      last_name: (c.last_name as string | null) ?? null,
      first_name: (c.first_name as string | null) ?? null,
    });
  }
  const staffMap = new Map<number, string>(
    (staffsRes.data ?? []).map((s) => [s.id as number, s.name as string])
  );
  const sourceMap = new Map<number, string>(
    (sourcesRes.data ?? []).map((s) => [s.id as number, s.name as string])
  );
  const planMenuMap = new Map<string, string>(
    (menusRes.data ?? []).map((m) => [
      m.menu_manage_id as string,
      m.name as string,
    ])
  );

  // appointment.id → plan_type のルックアップ。同じ予約で ticket と
  // subscription が同時に入ることは想定しないので最初にマッチしたもの
  // を採用する。customer_plans 起因でない「入会フラグのみ (従来)」は
  // このマップに入らないので、別ロジックでフォールバック markerする。
  const planTypeByApptId = new Map<number, "ticket" | "subscription">();
  for (const p of (plansRes.data ?? []) as Array<{
    customer_id: number;
    plan_type: string | null;
    purchased_appointment_id: number | null;
  }>) {
    if (!p.purchased_appointment_id) continue;
    if (p.plan_type !== "ticket" && p.plan_type !== "subscription") continue;
    if (!planTypeByApptId.has(p.purchased_appointment_id)) {
      planTypeByApptId.set(p.purchased_appointment_id, p.plan_type);
    }
  }

  // 3. customer_id ごとに appointments をグループ化 (start_at 昇順はクエリで保証済み)。
  const apptsByCustomer = new Map<number, ApptRow[]>();
  for (const a of allAppts) {
    const list = apptsByCustomer.get(a.customer_id);
    if (list) {
      list.push(a);
    } else {
      apptsByCustomer.set(a.customer_id, [a]);
    }
  }

  const nowIso = new Date().toISOString();

  // 4. 行を組み立てる (初回来店 appointment 1 件 = 1 行)。
  const rows: NewCustomerRow[] = firstVisits.map((first) => {
    const appts = apptsByCustomer.get(first.customer_id) ?? [first];
    const customer = customerMap.get(first.customer_id);

    // 入会 appointment は "is_member_join = true" の中で最も古いもの。
    const joinAppt = appts.find((a) => a.is_member_join === true) ?? null;
    const planName =
      joinAppt && joinAppt.menu_manage_id
        ? (planMenuMap.get(joinAppt.menu_manage_id) ?? null)
        : null;

    // 離反: 未来 (start_at > now) かつ status ∈ {0, 1} の appointment が 1 件もない。
    const hasFuture = appts.some(
      (a) => a.start_at > nowIso && (a.status === 0 || a.status === 1)
    );

    // 1〜N 回目: キャンセル系を除外した完了/予定順の先頭 MAX_VISIT_COLUMNS 件。
    // 各セルには marker を付けて「入会 / 回数券 / サブスク」購入の
    // タイミングが UI で一目で分かるようにする。
    const visitList: NewCustomerVisit[] = appts
      .filter((a) => !isCancelStatus(a.status))
      .slice(0, MAX_VISIT_COLUMNS)
      .map((a) => {
        const planType = planTypeByApptId.get(a.id) ?? null;
        let marker: VisitMarker = null;
        if (planType === "ticket") marker = "ticket";
        else if (planType === "subscription") marker = "subscription";
        else if (a.is_member_join) marker = "member_join";
        return {
          date: toLocalDateString(new Date(a.start_at)),
          sales: a.sales ?? 0,
          status: a.status,
          isMemberJoin: !!a.is_member_join,
          isCancel: false,
          marker,
        };
      });

    const purchaseCount = visitList.filter((v) => v.marker !== null).length;

    return {
      customerId: first.customer_id,
      code: customer?.code ?? null,
      name: customerFullName(customer?.last_name, customer?.first_name),
      staffId: first.staff_id ?? null,
      staffName:
        first.staff_id != null ? (staffMap.get(first.staff_id) ?? null) : null,
      visitSourceId: first.visit_source_id ?? null,
      visitSourceName:
        first.visit_source_id != null
          ? (sourceMap.get(first.visit_source_id) ?? null)
          : null,
      planName,
      isMemberJoin: !!joinAppt,
      isChurned: !hasFuture,
      purchaseCount,
      visits: visitList,
    };
  });

  // 5. スタッフ別 pivot。当月に初回来店があった担当者のみ列に出す。
  const staffBuckets = new Map<number, NewCustomerStaffBucket>();
  const totalBucket = emptyStaffBucket(null, "全体");

  for (const row of rows) {
    const bucket = (() => {
      if (row.staffId == null) return null;
      let b = staffBuckets.get(row.staffId);
      if (!b) {
        b = emptyStaffBucket(row.staffId, row.staffName ?? "(担当未設定)");
        staffBuckets.set(row.staffId, b);
      }
      return b;
    })();
    const targets = bucket ? [totalBucket, bucket] : [totalBucket];

    for (const t of targets) {
      t.newCount += 1;
      if (row.isMemberJoin) {
        t.joinCount += 1;
        // 入会プランが menus にヒットしていれば sales (そのプラン appointment) を足す。
        const joinVisit = row.visits.find((v) => v.isMemberJoin);
        if (joinVisit) t.memberTotal += joinVisit.sales;
      }
      // 1〜3 回目の売上 (status=2 を問わず sales を加算)
      for (let i = 0; i < Math.min(3, row.visits.length); i += 1) {
        t.salesByVisitIndex[i] += row.visits[i].sales;
      }
    }
  }

  const byStaff: NewCustomerStaffBucket[] = [
    finalizeBucket(totalBucket),
    ...Array.from(staffBuckets.values())
      .sort((a, b) => b.newCount - a.newCount)
      .map(finalizeBucket),
  ];

  // 6. 新規 vs 既存 sales。
  const newSales = monthAppts
    .filter((r) => (r.visit_count ?? 0) === 1)
    .reduce((sum, r) => sum + (r.sales ?? 0), 0);
  const existingSales = monthAppts
    .filter((r) => (r.visit_count ?? 0) > 1)
    .reduce((sum, r) => sum + (r.sales ?? 0), 0);

  return {
    yearMonth,
    rows,
    byStaff,
    sales: {
      newSales,
      existingSales,
      totalSales: newSales + existingSales,
    },
  };
}
