"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * ブランドの請求書メールテンプレートを保存する。
 * 件名 / 本文どちらも空文字列なら null に倒し、デフォルト本文に戻る。
 */
export async function savePayrollEmailTemplate(params: {
  brandId: number;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { brandId, subjectTemplate, bodyTemplate } = params;

  const { error } = await supabase
    .from("brands")
    .update({
      payroll_email_subject_template: subjectTemplate?.trim() || null,
      payroll_email_body_template: bodyTemplate?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandId);
  if (error) return { error: error.message };

  revalidatePath("/payroll");
  revalidatePath("/payroll/settings");
  return { success: true };
}
