"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Question } from "../types";
import { sanitizeSlug } from "../utils/slug";

interface CreateQuestionnaireInput {
  brand_id: number;
  shop_id?: number | null;
  slug: string;
  title: string;
  description?: string | null;
  questions: Question[];
  is_public?: boolean;
}

export async function createQuestionnaire(input: CreateQuestionnaireInput) {
  const supabase = await createClient();
  // Normalize the slug so future URLs are guaranteed to work.
  const normalizedSlug = sanitizeSlug(input.slug);
  if (!normalizedSlug) {
    return {
      error: "スラッグが空、または使用できない文字のみで構成されています。a-z, 0-9, ., -, _ を使ってください。",
    };
  }
  try {
    const { data, error } = await supabase
      .from("questionnaires")
      .insert({
        brand_id: input.brand_id,
        shop_id: input.shop_id ?? null,
        slug: normalizedSlug,
        title: input.title,
        description: input.description ?? null,
        questions: input.questions,
        is_public: input.is_public ?? true,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    revalidatePath("/questionnaire");
    return { success: true, id: data?.id as number };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "作成に失敗しました",
    };
  }
}

export async function updateQuestionnaire(
  id: number,
  input: Partial<CreateQuestionnaireInput>
) {
  const supabase = await createClient();
  try {
    const update: Record<string, unknown> = {};
    if (input.slug !== undefined) {
      const normalizedSlug = sanitizeSlug(input.slug);
      if (!normalizedSlug) {
        return {
          error:
            "スラッグが空、または使用できない文字のみで構成されています。a-z, 0-9, ., -, _ を使ってください。",
        };
      }
      update.slug = normalizedSlug;
    }
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.questions !== undefined) update.questions = input.questions;
    if (input.is_public !== undefined) update.is_public = input.is_public;

    const { error } = await supabase
      .from("questionnaires")
      .update(update)
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/questionnaire");
    revalidatePath(`/questionnaire/${id}`);
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "更新に失敗しました",
    };
  }
}

export async function deleteQuestionnaire(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("questionnaires")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/questionnaire");
  return { success: true };
}

/**
 * Public: submit a questionnaire response.
 * Fields marked with `field` are synced back to customers table
 * (creates the customer if none exists with matching phone).
 */
export async function submitQuestionnaireResponse(formData: FormData) {
  const supabase = await createClient();
  const questionnaireId = Number(formData.get("questionnaire_id"));
  const rawAnswers = formData.get("answers");
  if (!questionnaireId || !rawAnswers) {
    return { error: "無効な回答データです" };
  }
  let answers: Record<string, string | string[]>;
  try {
    answers = JSON.parse(String(rawAnswers));
  } catch {
    return { error: "回答データの形式が不正です" };
  }

  // Load questionnaire to know field mapping
  const { data: q, error: qErr } = await supabase
    .from("questionnaires")
    .select("*")
    .eq("id", questionnaireId)
    .is("deleted_at", null)
    .single();
  if (qErr || !q) return { error: "問診票が見つかりません" };

  const questions = (q.questions as Question[]) ?? [];

  // Build a customer update payload from fields marked with `field`
  const customerUpdate: Record<string, unknown> = {};
  for (const question of questions) {
    if (!question.field) continue;
    const raw = answers[question.id];
    const val = Array.isArray(raw) ? raw.join(", ") : raw;
    if (val == null || val === "") continue;

    switch (question.field) {
      case "full_name": {
        const parts = String(val).trim().split(/\s+/);
        customerUpdate.last_name = parts[0] ?? "";
        customerUpdate.first_name = parts.slice(1).join(" ") || null;
        break;
      }
      case "full_name_kana": {
        const parts = String(val).trim().split(/\s+/);
        customerUpdate.last_name_kana = parts[0] ?? "";
        customerUpdate.first_name_kana = parts.slice(1).join(" ") || null;
        break;
      }
      case "gender": {
        const s = String(val);
        customerUpdate.gender = s.includes("男") ? 1 : s.includes("女") ? 2 : 0;
        break;
      }
      default:
        customerUpdate[question.field] = val;
        break;
    }
  }

  // Attempt to find existing customer by phone if provided
  let customerId: number | null = null;
  const phone =
    customerUpdate.phone_number_1 ?? customerUpdate.phone ?? null;
  if (phone) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", q.shop_id ?? 1)
      .eq("phone_number_1", String(phone))
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) {
      customerId = existing.id as number;
      // Update existing customer with questionnaire fields
      await supabase
        .from("customers")
        .update(customerUpdate)
        .eq("id", customerId);
    }
  }

  // If not matched, create a new customer (minimum: name or phone)
  if (!customerId && (customerUpdate.last_name || phone)) {
    // Generate code
    const { data: maxRow } = await supabase
      .from("customers")
      .select("code")
      .eq("shop_id", q.shop_id ?? 1)
      .order("code", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextCode = "00000001";
    if (maxRow?.code) {
      const num = parseInt(String(maxRow.code), 10);
      if (!isNaN(num)) nextCode = String(num + 1).padStart(8, "0");
    }

    const insertData: Record<string, unknown> = {
      brand_id: q.brand_id,
      shop_id: q.shop_id ?? 1,
      code: nextCode,
      type: 0,
      gender: 0,
      phone_number_1: phone ?? "00000000000",
      ...customerUpdate,
    };
    const { data: inserted } = await supabase
      .from("customers")
      .insert(insertData)
      .select("id")
      .single();
    if (inserted?.id) customerId = inserted.id as number;
  }

  // Save response
  const { error: respErr } = await supabase
    .from("questionnaire_responses")
    .insert({
      questionnaire_id: questionnaireId,
      customer_id: customerId,
      answers,
    });
  if (respErr) return { error: respErr.message };

  return { success: true };
}
