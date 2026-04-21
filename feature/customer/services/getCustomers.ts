"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { Customer, CustomerSummary } from "../types";

interface GetCustomersOptions {
  search?: string;
  type?: number;
  page?: number;
  perPage?: number;
}

export async function getCustomers(
  shopId: number,
  options: GetCustomersOptions = {}
): Promise<{ data: Customer[]; totalCount: number }> {
  const { search, type, page = 1, perPage = 20 } = options;
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

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

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
  const { data: apptRaw } = await supabase
    .from("appointments")
    .select(
      "id, start_at, end_at, status, sales, memo, customer_record, menu_manage_id, is_continued_billing, consumed_plan_id, staffs(name)"
    )
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false })
    .limit(50);

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
  // Staff type just the number to pull up a returning patient, so
  // "12" should hit customer #12 first. Because the column is stored
  // as a string we need to match three shapes:
  //   1. exact new-format:        code = "12"
  //   2. legacy zero-padded:      code = "00000012"
  //   3. partial (contains)       code ILIKE "%12%"  ← ゼロ埋め桁数に
  //      依存せずヒットさせるため
  // We also let phone_number_1 contain the digits (for when staff type
  // a partial phone instead of a code). Final ranking enforces
  // "カルテNo マッチ > 電話だけマッチ" so phone-only hits never push
  // code hits down the list.
  // ---------------------------------------------------------------
  if (/^\d+$/.test(trimmed)) {
    const padded = trimmed.padStart(8, "0");
    const { data: codeHits, error: codeErr } = await supabase
      .from("customers")
      .select("id, code, last_name, first_name, phone_number_1")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(
        `code.eq.${trimmed},code.eq.${padded},code.ilike.%${trimmed}%,phone_number_1.ilike.%${trimmed}%`
      )
      .limit(limit * 3); // 後で tier でフィルタ/ソートするので少し多めに
    if (codeErr) throw codeErr;
    const rows = (codeHits ?? []) as CustomerSummary[];

    // マッチ種別の判定:
    //   0 = exact code (12 or 00000012)
    //   1 = code が trimmed を含む (先頭一致・途中一致どちらも)
    //   2 = phone だけのマッチ (コード側には digits が無い)
    const rankOf = (c: CustomerSummary): number => {
      const code = c.code ?? "";
      if (code === trimmed || code === padded) return 0;
      if (code.includes(trimmed)) return 1;
      const phone = c.phone_number_1 ?? "";
      if (phone.includes(trimmed)) return 2;
      return 3; // fallback — 通常到達しない
    };

    rows.sort((a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      const an = parseInt(a.code ?? "0", 10) || 0;
      const bn = parseInt(b.code ?? "0", 10) || 0;
      return an - bn;
    });
    return rows.slice(0, limit);
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
