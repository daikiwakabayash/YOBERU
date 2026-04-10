"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { Questionnaire, QuestionnaireResponse } from "../types";

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
      .single();
    if (error || !data) return null;
    return data as Questionnaire;
  } catch {
    return null;
  }
}

export async function getQuestionnaireBySlug(
  slug: string
): Promise<Questionnaire | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("questionnaires")
      .select("*")
      .eq("slug", slug)
      .eq("is_public", true)
      .is("deleted_at", null)
      .single();
    if (error || !data) return null;
    return data as Questionnaire;
  } catch {
    return null;
  }
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
