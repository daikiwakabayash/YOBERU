"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { Customer, CustomerSummary } from "../types";

interface GetCustomersOptions {
  search?: string;
  type?: number;
  /**
   * ページネーション (省略可)。指定すると range() で絞る。
   * 顧客一覧画面はページングを廃止して縦スクロール 1 ページに統一したため
   * 通常は省略する。サジェスト等で 上限を切りたいケースのみ使用。
   */
  page?: number;
  perPage?: number;
}

export async function getCustomers(
  shopId: number,
  options: GetCustomersOptions = {}
): Promise<{ data: Customer[]; totalCount: number }> {
  const { search, type, page, perPage } = options;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(
      `last_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name_kana.ilike.%${search}%,first_name_kana.ilike.%${search}%,phone_number_1.ilike.%${search}%,code.ilike.%${search}%`
    );
  }

  if (type !== undefined && type !== null) {
    query = query.eq("type", type);
  }

  // ページ指定があるときだけ range() を適用 (サジェスト等の用途)
  if (page != null && perPage != null) {
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data: data as Customer[], totalCount: count ?? 0 };
}

export async function getCustomer(id: number): Promise<Customer> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as Customer;
}

/**
 * Full customer dossier used by the AppointmentDetailSheet's right-hand
 * patient panel. Returns the customer row plus their recent appointment
 * history (latest 50) with menu names + staff names resolved, plus
 * derived totals (visit count, lifetime sales).
 *
 * We load this on-demand when the user picks a customer in the booking
 * flow so the panel can show "久しぶりに来院された患者さんへの電話
 * 対応" context at a glance — same data model as the /customer/:id
 * page, just rendered inline.
 */
export interface CustomerFullDetail {
  customer: Customer;
  visitCount: number;
  totalSales: number;
  lastVisitDate: string | null;
  appointments: Array<{
    id: number;
    startAt: string;
    endAt: string;
    status: number;
    sales: number;
    customerRecord: string | null;
    memo: string | null;
    menuName: string;
    staffName: string | null;
    /** 継続決済 (サブスク月次課金) の幽霊予約フラグ。来院回数には
     * 含めず、カルテ横の履歴表示では区別して描画できるようにする。 */
    isContinuedBilling: boolean;
    /** この予約がどのプランを何回目として消化したか。未消化は null。
     *  LINE 問い合わせ対応時に「来院履歴カードから直接この日何回目か
     *  分かる」UX のため。ordinal は顧客の該当プラン全消化の中での
     *  start_at ASC 順位 (1-indexed)。 */
    planConsumption: {
      planName: string;
      ordinal: number;
      total: number | null;
    } | null;
    /** カルテを最後に編集した日時 (migration 00029)。null = 会計時から
     *  変更されていない。 */
    karteUpdatedAt: string | null;
    /** カルテを最後に編集したユーザーのメールアドレス */
    karteUpdatedBy: string | null;
  }>;
}

export async function getCustomerFullDetail(
  customerId: number
): Promise<CustomerFullDetail | null> {
  const supabase = await createClient();

  // 1. Base customer row
  const { data: custRow, error: custErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (custErr || !custRow) return null;

  // 2. Last 50 appointments for this customer, newest first.
  //    `staffs(name)` is an FK join — Supabase returns it inline. We
  //    then resolve menu names via a single follow-up query to avoid
  //    the no-FK fragility documented in CLAUDE.md.
  // migration 00029 (customer_record_updated_at/_by) が未適用でも落ちない
  // よう、失敗したら監査カラム無しで再取得するフォールバック付き。
  let apptRaw: unknown[] | null = null;
  const firstTry = await supabase
    .from("appointments")
    .select(
      "id, start_at, end_at, status, sales, memo, customer_record, customer_record_updated_at, customer_record_updated_by, menu_manage_id, is_continued_billing, consumed_plan_id, staffs(name)"
    )
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false })
    .limit(50);
  if (
    firstTry.error &&
    (firstTry.error.message?.includes("customer_record_updated") ?? false)
  ) {
    const retry = await supabase
      .from("appointments")
      .select(
        "id, start_at, end_at, status, sales, memo, customer_record, menu_manage_id, is_continued_billing, consumed_plan_id, staffs(name)"
      )
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(50);
    apptRaw = retry.data ?? null;
  } else {
    apptRaw = firstTry.data ?? null;
  }

  const raw = (apptRaw ?? []) as Array<{
    id: number;
    start_at: string;
    end_at: string;
    status: number;
    sales: number | null;
    memo: string | null;
    customer_record: string | null;
    menu_manage_id: string;
    is_continued_billing: boolean | null;
    consumed_plan_id: number | null;
    customer_record_updated_at?: string | null;
    customer_record_updated_by?: string | null;
    staffs:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  }>;

  // Menu name lookup in one shot
  const menuIds = Array.from(new Set(raw.map((a) => a.menu_manage_id)));
  let menuNameMap = new Map<string, string>();
  if (menuIds.length > 0) {
    const { data: menus } = await supabase
      .from("menus")
      .select("menu_manage_id, name")
      .in("menu_manage_id", menuIds);
    menuNameMap = new Map(
      (menus ?? []).map(
        (m) => [m.menu_manage_id as string, m.name as string] as const
      )
    );
  }

  // ---- プラン消化 ordinal の計算 ----------------------------------------
  // "50 件の history に対して ordinal を振る" のではなく、顧客の全消化履歴
  // を start_at ASC で拾って「この予約は 3 回目の消化」を出す。direct lookup。
  const consumedPlanIdsInHistory = Array.from(
    new Set(
      raw
        .map((a) => a.consumed_plan_id)
        .filter((id): id is number => id != null)
    )
  );
  const planOrdinalByApptId = new Map<number, number>();
  const planMeta = new Map<number, { name: string; total: number | null }>();
  if (consumedPlanIdsInHistory.length > 0) {
    const [allConsumptionsRes, planRowsRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, start_at, consumed_plan_id")
        .eq("customer_id", customerId)
        .in("consumed_plan_id", consumedPlanIdsInHistory)
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
      supabase
        .from("customer_plans")
        .select("id, menu_name_snapshot, total_count")
        .in("id", consumedPlanIdsInHistory),
    ]);
    const consumptionsByPlan = new Map<number, number[]>();
    for (const row of (allConsumptionsRes.data ?? []) as Array<{
      id: number;
      consumed_plan_id: number;
    }>) {
      const list = consumptionsByPlan.get(row.consumed_plan_id) ?? [];
      list.push(row.id);
      consumptionsByPlan.set(row.consumed_plan_id, list);
    }
    for (const [, apptIds] of consumptionsByPlan) {
      apptIds.forEach((aid, i) => planOrdinalByApptId.set(aid, i + 1));
    }
    for (const p of (planRowsRes.data ?? []) as Array<{
      id: number;
      menu_name_snapshot: string;
      total_count: number | null;
    }>) {
      planMeta.set(p.id, {
        name: p.menu_name_snapshot,
        total: p.total_count ?? null,
      });
    }
  }

  const appointments = raw.map((a) => {
    const staff = Array.isArray(a.staffs) ? a.staffs[0] ?? null : a.staffs;
    const planConsumption =
      a.consumed_plan_id != null && planMeta.has(a.consumed_plan_id)
        ? {
            planName:
              planMeta.get(a.consumed_plan_id)?.name ?? "プラン",
            ordinal: planOrdinalByApptId.get(a.id) ?? 0,
            total: planMeta.get(a.consumed_plan_id)?.total ?? null,
          }
        : null;
    return {
      id: a.id,
      startAt: a.start_at,
      endAt: a.end_at,
      status: a.status,
      sales: a.sales ?? 0,
      customerRecord: a.customer_record,
      memo: a.memo,
      menuName: menuNameMap.get(a.menu_manage_id) ?? a.menu_manage_id,
      staffName: staff?.name ?? null,
      isContinuedBilling: !!a.is_continued_billing,
      planConsumption,
      karteUpdatedAt: a.customer_record_updated_at ?? null,
      karteUpdatedBy: a.customer_record_updated_by ?? null,
    };
  });

  // 来院回数 / 累計売上 / 最終来院日は「実来院の会計完了」だけをカウントする。
  // 継続決済 (サブスク月次課金の幽霊予約) は status=2 でも除外し、履歴
  // リストには残すが visit_count には積まない運用ルールに合わせる。
  const realVisits = appointments.filter(
    (a) => a.status === 2 && !a.isContinuedBilling
  );
  const visitCount = realVisits.length;
  const totalSales = realVisits.reduce((sum, a) => sum + (a.sales || 0), 0);
  const lastVisitDate =
    realVisits.length > 0 ? realVisits[0].startAt.slice(0, 10) : null;

  return {
    customer: custRow as Customer,
    visitCount,
    totalSales,
    lastVisitDate,
    appointments,
  };
}

export async function searchCustomers(
  shopId: number,
  query: string,
  limit: number = 10
): Promise<CustomerSummary[]> {
  const supabase = await createClient();
  const trimmed = query.trim();
  if (!trimmed) return [];

  // ---------------------------------------------------------------
  // Numeric queries → カルテナンバー (customers.code) lookup.
  //
  // 戦略:
  //   STEP 1: まず厳密一致 (code = trimmed OR code = zero-padded) を
  //           1 クエリで取得。これで "5" → カルテ #5 が必ず先頭に出る。
  //   STEP 2: limit に余裕があれば、含む検索 (code ILIKE %d% / phone
  //           ILIKE %d%) を別クエリで取って、STEP1 で取れた id を除外し
  //           つつ追記する。
  //
  //   旧実装は 1 クエリ + ランク再ソートだったが、Postgres の OR 検索の
  //   返却件数 (limit*3) が phone-contains の大量ヒットで埋まると、
  //   rank=0 の唯一の厳密一致行がそもそも返却されない可能性があった。
  //   それが「5 と入れても 5 番が出てこない」報告の原因。
  // ---------------------------------------------------------------
  if (/^\d+$/.test(trimmed)) {
    const padded = trimmed.padStart(8, "0");

    // STEP 1: 厳密一致
    const exactRes = await supabase
      .from("customers")
      .select("id, code, last_name, first_name, phone_number_1")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(`code.eq.${trimmed},code.eq.${padded}`)
      .limit(limit);
    if (exactRes.error) throw exactRes.error;
    const exactRows = (exactRes.data ?? []) as CustomerSummary[];
    const seen = new Set(exactRows.map((r) => r.id));

    // 厳密一致だけで limit を埋めたら return
    if (exactRows.length >= limit) return exactRows.slice(0, limit);

    // STEP 2: 含む検索で補完。phone は数字 1-2 文字だと大量ヒットして
    // ノイズになるため、3 文字以上の時だけ phone を含める。
    const remaining = limit - exactRows.length;
    const orParts = [
      `code.ilike.%${trimmed}%`,
      ...(trimmed.length >= 3 ? [`phone_number_1.ilike.%${trimmed}%`] : []),
    ];
    const looseRes = await supabase
      .from("customers")
      .select("id, code, last_name, first_name, phone_number_1")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(orParts.join(","))
      .limit(remaining * 3);
    if (looseRes.error) throw looseRes.error;
    const looseRows = ((looseRes.data ?? []) as CustomerSummary[])
      .filter((r) => !seen.has(r.id))
      .sort((a, b) => {
        // code を数値解釈して昇順 (= 小さいカルテ番号が上)
        const an = parseInt(a.code ?? "0", 10) || Number.MAX_SAFE_INTEGER;
        const bn = parseInt(b.code ?? "0", 10) || Number.MAX_SAFE_INTEGER;
        return an - bn;
      })
      .slice(0, remaining);

    return [...exactRows, ...looseRows];
  }

  // ---------------------------------------------------------------
  // Non-numeric queries → name / kana / phone / (partial) code.
  // ---------------------------------------------------------------
  const { data, error } = await supabase
    .from("customers")
    .select("id, code, last_name, first_name, phone_number_1")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .or(
      `last_name.ilike.%${trimmed}%,first_name.ilike.%${trimmed}%,last_name_kana.ilike.%${trimmed}%,first_name_kana.ilike.%${trimmed}%,phone_number_1.ilike.%${trimmed}%,code.ilike.%${trimmed}%`
    )
    .limit(limit);
  if (error) throw error;
  return data as CustomerSummary[];
}
