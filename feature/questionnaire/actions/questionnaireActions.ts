"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { toLocalDateString } from "@/helper/utils/time";
import type { Question } from "../types";
import { sanitizeSlug } from "../utils/slug";

/**
 * Build a human-readable Q&A block to append to customers.description.
 * Format:
 *   [2026-04-11 問診票: 恵比寿]
 *   - 来院動機: 腰痛
 *   - 症状: ぎっくり腰になりました
 *   - …
 * Empty answers are skipped. The block is appended (with a blank line
 * separator) so multiple questionnaires accumulate over time.
 */
function buildQuestionnaireSummary(
  questionnaireTitle: string,
  questions: Question[],
  answers: Record<string, string | string[]>
): string {
  const dateLabel = toLocalDateString(new Date());
  const lines: string[] = [`[${dateLabel} 問診票: ${questionnaireTitle}]`];
  for (const q of questions) {
    const raw = answers[q.id];
    if (raw == null) continue;
    const val = Array.isArray(raw) ? raw.join(", ") : String(raw);
    if (val.trim() === "") continue;
    lines.push(`- ${q.label}: ${val}`);
  }
  return lines.join("\n");
}

function appendDescription(
  existing: string | null | undefined,
  block: string
): string {
  const base = (existing ?? "").trimEnd();
  if (!base) return block;
  return `${base}\n\n${block}`;
}

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
 *
 * Always:
 *  - Maps `field`-marked questions onto customers columns
 *    (full_name, gender, phone_number_1, …).
 *  - Appends a formatted Q&A summary of EVERY answered question to the
 *    customer's `description` (memo) so the staff can read 来院動機 etc.
 *    directly from the customer detail page.
 *  - Creates a placeholder customer when the form has neither name nor
 *    phone (rare but possible) so the response is never orphaned.
 *  - Saves the raw response to questionnaire_responses for CSV export.
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

  // Load questionnaire to know field mapping + title
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

  // Build the human-readable Q&A summary for customers.description
  const summaryBlock = buildQuestionnaireSummary(
    String(q.title ?? "問診票"),
    questions,
    answers
  );

  const targetShopId = (q.shop_id as number | null) ?? null;
  const brandId = q.brand_id as number;

  // Extract name fields for tiered matching
  const lastName =
    (customerUpdate.last_name as string | undefined) ?? null;

  // Attempt to find existing customer using tiered matching:
  //  Tier 1: phone + name within same shop (most specific)
  //  Tier 2: phone + name across brand (cross-shop match)
  //  Tier 3: phone only across brand (name format differences)
  let customerId: number | null = null;
  let existingDescription: string | null = null;
  const phone =
    customerUpdate.phone_number_1 ?? customerUpdate.phone ?? null;

  if (phone) {
    // Tier 1: phone + name within same shop
    if (!customerId && targetShopId && lastName) {
      const { data: tier1 } = await supabase
        .from("customers")
        .select("id, description")
        .eq("shop_id", targetShopId)
        .eq("phone_number_1", String(phone))
        .eq("last_name", lastName)
        .is("deleted_at", null)
        .maybeSingle();
      if (tier1?.id) {
        customerId = tier1.id as number;
        existingDescription = (tier1.description as string | null) ?? null;
      }
    }

    // Tier 2: phone + name across brand
    if (!customerId && lastName) {
      const { data: tier2 } = await supabase
        .from("customers")
        .select("id, description")
        .eq("brand_id", brandId)
        .eq("phone_number_1", String(phone))
        .eq("last_name", lastName)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (tier2?.id) {
        customerId = tier2.id as number;
        existingDescription = (tier2.description as string | null) ?? null;
      }
    }

    // Tier 3: phone only across brand
    if (!customerId) {
      const { data: tier3 } = await supabase
        .from("customers")
        .select("id, description")
        .eq("brand_id", brandId)
        .eq("phone_number_1", String(phone))
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (tier3?.id) {
        customerId = tier3.id as number;
        existingDescription = (tier3.description as string | null) ?? null;
      }
    }

    // Update matched customer: merge field-mapped values + append the
    // questionnaire summary onto the existing description (memo).
    if (customerId) {
      await supabase
        .from("customers")
        .update({
          ...customerUpdate,
          description: appendDescription(existingDescription, summaryBlock),
        })
        .eq("id", customerId);
    }
  }

  // If not matched, create a new customer. We always create now (even
  // when neither name nor phone is provided) so questionnaire responses
  // are never orphaned. A placeholder name is generated in that edge
  // case so the staff can recognise it and rename later.
  if (!customerId) {
    // Determine shop_id for new customer: use questionnaire's shop_id,
    // or fall back to the brand's first shop (by sort_number).
    let newCustomerShopId = targetShopId;
    if (!newCustomerShopId) {
      const { data: brandShop } = await supabase
        .from("shops")
        .select("id")
        .eq("brand_id", brandId)
        .is("deleted_at", null)
        .order("sort_number", { ascending: true })
        .limit(1)
        .maybeSingle();
      newCustomerShopId = (brandShop?.id as number | null) ?? null;
    }
    if (!newCustomerShopId) {
      console.error("[questionnaire] no shop found for brand", brandId);
    }

    const { data: maxRow } = await supabase
      .from("customers")
      .select("code")
      .eq("shop_id", newCustomerShopId ?? 0)
      .order("code", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextCode = "00000001";
    if (maxRow?.code) {
      const num = parseInt(String(maxRow.code), 10);
      if (!isNaN(num)) nextCode = String(num + 1).padStart(8, "0");
    }

    const placeholderLastName =
      (customerUpdate.last_name as string | undefined) ||
      `(問診票回答 ${toLocalDateString(new Date())})`;

    const insertData: Record<string, unknown> = {
      brand_id: brandId,
      shop_id: newCustomerShopId,
      code: nextCode,
      type: 0,
      gender: 0,
      phone_number_1: phone ?? "00000000000",
      ...customerUpdate,
      last_name: placeholderLastName,
      description: summaryBlock,
    };
    const { data: inserted, error: insertErr } = await supabase
      .from("customers")
      .insert(insertData)
      .select("id")
      .single();
    if (insertErr) {
      console.error("[questionnaire] customer insert failed", insertErr);
    }
    if (inserted?.id) customerId = inserted.id as number;
  }

  // Save response (links to customer when one was created/matched)
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
