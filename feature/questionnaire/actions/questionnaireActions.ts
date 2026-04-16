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

  // 問診票がブランド共通 (shop_id NULL) の場合、全店舗を横断して
  // 顧客を検索する。店舗限定問診票の場合はその shop_id で絞る。
  // 旧実装は NULL 時にフォールバック 1 を使っていたため、顧客が
  // 別の shop にいるとマッチに失敗して問診票が反映されなかった。
  const questShopId: number | null = (q.shop_id as number | null);

  // ---- 既存顧客とのマッチング ----
  //
  // 「名前と電話番号で一致させる」要件に沿って 3 段階で探す:
  //   1) 電話 + 姓 + 名 が全部一致 (一番強い)
  //   2) 電話のみ一致 (引っ越し等で名前変えた場合)
  //   3) 姓 + 名 が一致 (機種変更で電話番号が変わった場合)
  // どれにもマッチしなければ新規作成。
  let customerId: number | null = null;
  let existingDescription: string | null = null;
  let matchedShopId: number | null = null;

  const phone =
    (customerUpdate.phone_number_1 as string | undefined) ??
    (customerUpdate.phone as string | undefined) ??
    null;
  const lastName = (customerUpdate.last_name as string | undefined) ?? null;
  const firstName = (customerUpdate.first_name as string | undefined) ?? null;

  // shop_id フィルタ付きクエリビルダー。ブランド共通問診票のときは
  // shop_id 条件を付けず全店舗を横断検索する。
  function custQuery() {
    let qb = supabase
      .from("customers")
      .select("id, description, shop_id");
    if (questShopId != null) qb = qb.eq("shop_id", questShopId);
    return qb.is("deleted_at", null);
  }

  // 1) 電話 + 姓 + 名 で完全一致
  if (phone && lastName && firstName) {
    const { data: byBoth } = await custQuery()
      .eq("phone_number_1", String(phone))
      .eq("last_name", String(lastName))
      .eq("first_name", String(firstName))
      .limit(1)
      .maybeSingle();
    if (byBoth?.id) {
      customerId = byBoth.id as number;
      existingDescription = (byBoth.description as string | null) ?? null;
      matchedShopId = (byBoth.shop_id as number | null) ?? null;
    }
  }

  // 2) 電話のみ
  if (!customerId && phone) {
    const { data: byPhone } = await custQuery()
      .eq("phone_number_1", String(phone))
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) {
      customerId = byPhone.id as number;
      existingDescription = (byPhone.description as string | null) ?? null;
      matchedShopId = (byPhone.shop_id as number | null) ?? null;
    }
  }

  // 3) 姓 + 名
  if (!customerId && lastName && firstName) {
    const { data: byName } = await custQuery()
      .eq("last_name", String(lastName))
      .eq("first_name", String(firstName))
      .limit(1)
      .maybeSingle();
    if (byName?.id) {
      customerId = byName.id as number;
      existingDescription = (byName.description as string | null) ?? null;
      matchedShopId = (byName.shop_id as number | null) ?? null;
    }
  }

  // マッチした場合: 既存顧客に上書き + description にサマリを追記
  if (customerId) {
    await supabase
      .from("customers")
      .update({
        ...customerUpdate,
        description: appendDescription(existingDescription, summaryBlock),
      })
      .eq("id", customerId);
  }

  // どれにもマッチしなければ新規作成。
  // 名前も電話も無いケースでもプレースホルダ名で作成して、回答が
  // どこにも紐付かない孤立状態にならないようにする。
  if (!customerId) {
    // customers.code は UNIQUE (グローバル、全店舗・削除済み含む) なので、
    // 採番は全レコードを対象に最大値を求める。shop_id や deleted_at で
    // 絞ると他店舗/削除済みのコードと衝突して UNIQUE 違反になる。
    const { data: allCodes } = await supabase
      .from("customers")
      .select("code");
    let maxNumeric = 0;
    for (const r of (allCodes ?? []) as Array<{ code: string | null }>) {
      const n = parseInt((r.code ?? "0").trim(), 10);
      if (Number.isFinite(n) && n > maxNumeric) maxNumeric = n;
    }
    const nextCode = String(maxNumeric + 1);

    const placeholderLastName =
      (customerUpdate.last_name as string | undefined) ||
      `(問診票回答 ${toLocalDateString(new Date())})`;

    // 新規作成時の shop_id: マッチ済み顧客の店舗 → 問診票の店舗 → 1
    const newCustShopId = matchedShopId ?? questShopId ?? 1;
    const insertData: Record<string, unknown> = {
      brand_id: q.brand_id,
      shop_id: newCustShopId,
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

  // 顧客一覧 / 顧客詳細にすぐ反映させるために revalidate。
  revalidatePath("/customer");
  if (customerId) revalidatePath(`/customer/${customerId}`);

  return { success: true };
}
