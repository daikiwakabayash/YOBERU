"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { Questionnaire, QuestionnaireResponse } from "../types";
import { sanitizeSlug } from "../utils/slug";

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message ?? "");
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    (error as { code?: string }).code === "42P01" ||
    (error as { code?: string }).code === "PGRST205"
  );
}

export async function getQuestionnaires(
  brandId: number
): Promise<{ data: Questionnaire[]; setupRequired: boolean }> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("questionnaires")
      .select("*")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTableError(error))
        return { data: [], setupRequired: true };
      return { data: [], setupRequired: false };
    }
    return { data: (data ?? []) as Questionnaire[], setupRequired: false };
  } catch (err) {
    if (isMissingTableError(err))
      return { data: [], setupRequired: true };
    return { data: [], setupRequired: false };
  }
}

export async function getQuestionnaireById(
  id: number
): Promise<Questionnaire | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("questionnaires")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return data as Questionnaire;
  } catch {
    return null;
  }
}

/**
 * Look up a questionnaire by slug. Handles a few common slug mangling
 * scenarios so a 404 doesn't happen just because the slug was stored
 * with whitespace etc.:
 *
 *  1. Exact match (what the URL decoded to)
 *  2. Trimmed match (URL had stray spaces)
 *  3. Sanitized match (stored slug contained spaces/invalid chars)
 *
 * Uses .maybeSingle() so 0-row results don't throw; returns null cleanly.
 */
export async function getQuestionnaireBySlug(
  slug: string
): Promise<Questionnaire | null> {
  const supabase = await createClient();

  async function tryFetch(s: string): Promise<Questionnaire | null> {
    try {
      const { data, error } = await supabase
        .from("questionnaires")
        .select("*")
        .eq("slug", s)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        console.error("[questionnaire] tryFetch error", { slug: s, error });
        return null;
      }
      if (!data) return null;
      // Only surface public questionnaires in the public route
      if ((data as Questionnaire).is_public === false) return null;
      return data as Questionnaire;
    } catch (e) {
      console.error("[questionnaire] tryFetch threw", { slug: s, error: e });
      return null;
    }
  }

  // 1. Exact match
  const exact = await tryFetch(slug);
  if (exact) return exact;

  // 2. Trimmed match
  const trimmed = slug.trim();
  if (trimmed && trimmed !== slug) {
    const hit = await tryFetch(trimmed);
    if (hit) return hit;
  }

  // 3. Sanitized match (convert requested slug to the canonical form)
  const sanitized = sanitizeSlug(slug);
  if (sanitized && sanitized !== slug && sanitized !== trimmed) {
    const hit = await tryFetch(sanitized);
    if (hit) return hit;
  }

  // 4. Fuzzy full-scan: sanitize each row and compare to canonical input.
  //    Catches legacy rows whose slug was stored with spaces / mixed case.
  try {
    const { data, error } = await supabase
      .from("questionnaires")
      .select("*")
      .is("deleted_at", null);
    if (error) {
      console.error("[questionnaire] fallback4 fetch error", error);
    }
    const canonical = sanitized || slug.toLowerCase().replace(/\s+/g, "-");
    for (const row of (data ?? []) as Questionnaire[]) {
      const rowCanonical = sanitizeSlug(row.slug ?? "");
      if (rowCanonical && rowCanonical === canonical) {
        if (row.is_public === false) continue;
        return row;
      }
    }
  } catch (e) {
    console.error("[questionnaire] fallback4 threw", e);
  }

  // 5. Final defensive net: ilike (case-insensitive substring) on the
  //    sanitized form. Useful when fallback 4 was unavailable due to RLS
  //    or scan timeout. Limited to 5 results; first public match wins.
  try {
    const probe = sanitized || trimmed || slug;
    if (probe) {
      const { data, error } = await supabase
        .from("questionnaires")
        .select("*")
        .ilike("slug", `%${probe}%`)
        .is("deleted_at", null)
        .limit(5);
      if (error) {
        console.error("[questionnaire] fallback5 ilike error", error);
      }
      for (const row of (data ?? []) as Questionnaire[]) {
        if (row.is_public === false) continue;
        return row;
      }
    }
  } catch (e) {
    console.error("[questionnaire] fallback5 threw", e);
  }

  console.error("[questionnaire] all fallbacks missed", { slug });
  return null;
}

export async function getResponsesForQuestionnaire(
  questionnaireId: number
): Promise<QuestionnaireResponse[]> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("questionnaire_responses")
      .select("*")
      .eq("questionnaire_id", questionnaireId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []) as QuestionnaireResponse[];
  } catch {
    return [];
  }
}
