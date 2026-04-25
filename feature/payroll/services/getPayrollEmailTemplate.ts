"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface PayrollEmailTemplate {
  subjectTemplate: string | null;
  bodyTemplate: string | null;
}

/**
 * ブランド単位の請求書メールテンプレート (件名 / 本文) を取得する。
 * 未設定の場合は subjectTemplate / bodyTemplate ともに null を返す。
 *
 * migration 00037 未適用環境でも落ちないよう、カラム不存在のときは
 * デフォルト (null/null) で返す。
 */
export async function getPayrollEmailTemplate(
  brandId: number
): Promise<PayrollEmailTemplate> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("payroll_email_subject_template, payroll_email_body_template")
    .eq("id", brandId)
    .maybeSingle();

  if (error) {
    return { subjectTemplate: null, bodyTemplate: null };
  }
  return {
    subjectTemplate: (data?.payroll_email_subject_template as string | null) ?? null,
    bodyTemplate: (data?.payroll_email_body_template as string | null) ?? null,
  };
}

/**
 * テンプレート文字列内の {{placeholder}} を実際の値で置換する。
 * 未対応のプレースホルダはそのまま残す (誤入力検知のヒント)。
 */
export function applyTemplate(
  tmpl: string,
  vars: Record<string, string | number>
): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return `{{${name}}}`;
  });
}
