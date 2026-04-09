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
    const trimmed = search.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const p0 = parts[0];
      const p1 = parts.slice(1).join(" ");
      query = query.or(
        [
          `and(last_name.ilike.%${p0}%,first_name.ilike.%${p1}%)`,
          `and(last_name.ilike.%${p1}%,first_name.ilike.%${p0}%)`,
          `last_name.ilike.%${trimmed}%`,
          `first_name.ilike.%${trimmed}%`,
          `last_name_kana.ilike.%${trimmed}%`,
          `first_name_kana.ilike.%${trimmed}%`,
          `phone_number_1.ilike.%${trimmed}%`,
          `code.ilike.%${trimmed}%`,
        ].join(",")
      );
    } else {
      query = query.or(
        `last_name.ilike.%${trimmed}%,first_name.ilike.%${trimmed}%,last_name_kana.ilike.%${trimmed}%,first_name_kana.ilike.%${trimmed}%,phone_number_1.ilike.%${trimmed}%,code.ilike.%${trimmed}%`
      );
    }
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
  const parts = trimmed.split(/\s+/);

  let baseQuery = supabase
    .from("customers")
    .select("id, code, last_name, first_name, phone_number_1")
    .eq("shop_id", shopId)
    .is("deleted_at", null);

  if (parts.length >= 2) {
    // Multi-part search: try both orderings of name parts across last_name/first_name
    const p0 = parts[0];
    const p1 = parts.slice(1).join(" ");
    baseQuery = baseQuery.or(
      [
        `and(last_name.ilike.%${p0}%,first_name.ilike.%${p1}%)`,
        `and(last_name.ilike.%${p1}%,first_name.ilike.%${p0}%)`,
        `last_name.ilike.%${trimmed}%`,
        `first_name.ilike.%${trimmed}%`,
        `last_name_kana.ilike.%${trimmed}%`,
        `first_name_kana.ilike.%${trimmed}%`,
        `phone_number_1.ilike.%${trimmed}%`,
        `code.ilike.%${trimmed}%`,
      ].join(",")
    );
  } else {
    baseQuery = baseQuery.or(
      `last_name.ilike.%${trimmed}%,first_name.ilike.%${trimmed}%,last_name_kana.ilike.%${trimmed}%,first_name_kana.ilike.%${trimmed}%,phone_number_1.ilike.%${trimmed}%,code.ilike.%${trimmed}%`
    );
  }

  const { data, error } = await baseQuery.limit(limit);
  if (error) throw error;
  return data as CustomerSummary[];
}
