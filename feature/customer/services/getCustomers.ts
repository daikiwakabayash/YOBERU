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
      "id, start_at, end_at, status, sales, memo, customer_record, menu_manage_id, staffs(name)"
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

  const appointments = raw.map((a) => {
    const staff = Array.isArray(a.staffs) ? a.staffs[0] ?? null : a.staffs;
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
    };
  });

  // Derived metrics: 完了 (status=2) 予約だけをカウント
  const completed = appointments.filter((a) => a.status === 2);
  const visitCount = completed.length;
  const totalSales = completed.reduce((sum, a) => sum + (a.sales || 0), 0);
  const lastVisitDate =
    completed.length > 0 ? completed[0].startAt.slice(0, 10) : null;

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
  // as a string we need to match two shapes:
  //   1. exact new-format:    code = "12"
  //   2. legacy zero-padded:  code = "00000012"
  // We also allow prefix matching ("1" → 1, 10-19, 100...) so the
  // search dropdown starts returning candidates as the user types.
  // The final list is de-duped and re-ordered so exact-code matches
  // always sit at the top.
  // ---------------------------------------------------------------
  if (/^\d+$/.test(trimmed)) {
    const padded = trimmed.padStart(8, "0");
    const { data: codeHits, error: codeErr } = await supabase
      .from("customers")
      .select("id, code, last_name, first_name, phone_number_1")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(
        `code.eq.${trimmed},code.eq.${padded},code.ilike.${trimmed}%,phone_number_1.ilike.%${trimmed}%`
      )
      .limit(limit);
    if (codeErr) throw codeErr;
    const rows = (codeHits ?? []) as CustomerSummary[];
    // Exact code match wins — sort it to position 0.
    rows.sort((a, b) => {
      const aExact =
        a.code === trimmed || a.code === padded ? 0 : 1;
      const bExact =
        b.code === trimmed || b.code === padded ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      // Otherwise numeric-ish ordering by code so shorter codes show
      // up first (1, 10, 11, 12... rather than 12, 13, 1).
      const an = parseInt(a.code ?? "0", 10) || 0;
      const bn = parseInt(b.code ?? "0", 10) || 0;
      return an - bn;
    });
    return rows;
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
