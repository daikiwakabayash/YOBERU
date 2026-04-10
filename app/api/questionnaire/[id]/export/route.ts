import { NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import type { Question } from "@/feature/questionnaire/types";

/**
 * CSV export of all responses for a questionnaire.
 * Columns:
 *   - response_id, created_at, customer_id
 *   - one column per question (using question label)
 */

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[,"\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = await createClient();

  // Load questionnaire (for question ordering/labels)
  const { data: q, error: qErr } = await supabase
    .from("questionnaires")
    .select("*")
    .eq("id", numId)
    .is("deleted_at", null)
    .single();

  if (qErr || !q) {
    return NextResponse.json(
      { error: "問診票が見つかりません" },
      { status: 404 }
    );
  }

  const questions = (q.questions as Question[]) ?? [];

  // Load all responses
  const { data: responses } = await supabase
    .from("questionnaire_responses")
    .select("*")
    .eq("questionnaire_id", numId)
    .order("created_at", { ascending: false });

  // Build header row
  const header = ["回答ID", "回答日時", "顧客ID"];
  for (const question of questions) {
    header.push(question.label);
  }

  const rows: string[] = [];
  rows.push(header.map(escapeCsv).join(","));

  for (const resp of responses ?? []) {
    const answers = (resp.answers as Record<string, string | string[]>) ?? {};
    const row: string[] = [
      String(resp.id),
      String(resp.created_at ?? ""),
      resp.customer_id ? String(resp.customer_id) : "",
    ];
    for (const question of questions) {
      const val = answers[question.id];
      const str = Array.isArray(val) ? val.join(" / ") : (val ?? "");
      row.push(String(str));
    }
    rows.push(row.map(escapeCsv).join(","));
  }

  // Prepend UTF-8 BOM so Excel correctly opens Japanese chars
  const bom = "\uFEFF";
  const csv = bom + rows.join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="questionnaire-${numId}.csv"`,
    },
  });
}
