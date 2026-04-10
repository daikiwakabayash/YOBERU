"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { BookingLink } from "../types";

export async function getBookingLinks(
  brandId: number
): Promise<{ data: BookingLink[]; totalCount: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("booking_links")
    .select("*", { count: "exact" })
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    return { data: [], totalCount: 0 };
  }
  return {
    data: (data ?? []) as BookingLink[],
    totalCount: count ?? 0,
  };
}

export async function getBookingLinkBySlug(
  slug: string
): Promise<BookingLink | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_links")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .single();
  if (error || !data) return null;
  return data as BookingLink;
}

export async function getBookingLinkById(
  id: number
): Promise<BookingLink | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_links")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error || !data) return null;
  return data as BookingLink;
}
