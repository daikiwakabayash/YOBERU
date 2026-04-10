"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { BookingLink } from "../types";

/**
 * Check if a Postgres error is "table not found"
 */
function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message ?? "");
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation") ||
    (error as { code?: string }).code === "42P01" ||
    (error as { code?: string }).code === "PGRST205"
  );
}

export async function getBookingLinks(
  brandId: number
): Promise<{ data: BookingLink[]; totalCount: number; setupRequired: boolean }> {
  const supabase = await createClient();
  try {
    const { data, error, count } = await supabase
      .from("booking_links")
      .select("*", { count: "exact" })
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTableError(error)) {
        return { data: [], totalCount: 0, setupRequired: true };
      }
      return { data: [], totalCount: 0, setupRequired: false };
    }
    return {
      data: (data ?? []) as BookingLink[],
      totalCount: count ?? 0,
      setupRequired: false,
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { data: [], totalCount: 0, setupRequired: true };
    }
    return { data: [], totalCount: 0, setupRequired: false };
  }
}

export async function getBookingLinkBySlug(
  slug: string
): Promise<BookingLink | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("booking_links")
      .select("*")
      .eq("slug", slug)
      .is("deleted_at", null)
      .single();
    if (error || !data) return null;
    return data as BookingLink;
  } catch {
    return null;
  }
}

export async function getBookingLinkById(
  id: number
): Promise<BookingLink | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("booking_links")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return null;
    return data as BookingLink;
  } catch {
    return null;
  }
}
