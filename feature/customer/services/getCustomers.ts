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
