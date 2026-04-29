"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/helper/lib/supabase/server";
import { sendEmail } from "@/helper/lib/email/sendEmail";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";
import { applyAgreementVars, type AgreementKind } from "../types";

/**
 * 顧客向けに新しい同意書 (会員申込書 等) のリンクを発行する。
 * /agree/<uuid> を LINE / メールで送ると顧客が署名できる。
 *
 * ID/PW を発行しない代わりに、UUID 自体が秘密鍵的な役割を担う
 * (推測困難な v4 UUID)。
 */
export async function createAgreement(params: {
  customerId: number;
  templateId: number;
  /** 月額 / 契約開始日 等、本文プレースホルダーに埋める変数 */
  vars: Record<string, string | number>;
}): Promise<{ success?: true; uuid?: string; error?: string }> {
  const supabase = await createClient();

  // template の brand_id / shop_id / kind を取得 (整合性 + kind 確定)
  const { data: tpl } = await supabase
    .from("agreement_templates")
    .select("id, brand_id, shop_id, kind")
    .eq("id", params.templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tpl) return { error: "テンプレートが見つかりません" };

  const { data: customer } = await supabase
    .from("customers")
    .select("id, brand_id, shop_id")
    .eq("id", params.customerId)
    .maybeSingle();
  if (!customer) return { error: "顧客が見つかりません" };

  const newUuid = crypto.randomUUID();

  // 作成者ユーザー (本部スタッフ) の users.id を解決
  let createdByUserId: number | null = null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    createdByUserId = (u?.id as number | undefined) ?? null;
  }

  const { error } = await supabase.from("agreements").insert({
    uuid: newUuid,
    brand_id: customer.brand_id ?? tpl.brand_id,
    shop_id: customer.shop_id,
    customer_id: params.customerId,
    template_id: params.templateId,
    kind: tpl.kind,
    vars: params.vars,
    status: "pending",
    created_by_user_id: createdByUserId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/customer/${params.customerId}`);
  revalidatePath("/agreement");
  return { success: true, uuid: newUuid };
}

/**
 * 顧客側で署名を確定する (公開ルート /agree/<uuid> から呼ばれる)。
 *
 * 一度 status=signed になった行は変更不可 (二重署名防止)。
 */
export async function signAgreement(params: {
  uuid: string;
  signedName: string;
  signatureDataUrl: string;
  agreedChecks: Record<string, boolean>;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { uuid, signedName, signatureDataUrl, agreedChecks } = params;

  if (!signedName.trim()) {
    return { error: "氏名を入力してください" };
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image")) {
    return { error: "署名を記入してください" };
  }

  // 既存行 + テンプレート取得
  const { data: agreement } = await supabase
    .from("agreements")
    .select("id, status, template_id, vars, customer_id")
    .eq("uuid", uuid)
    .is("deleted_at", null)
    .maybeSingle();
  if (!agreement) return { error: "対象の同意書が見つかりません" };
  if (agreement.status === "signed") {
    return { error: "この同意書は既に署名済みです" };
  }
  if (agreement.status === "cancelled") {
    return { error: "この同意書は取消されています" };
  }

  const { data: tpl } = await supabase
    .from("agreement_templates")
    .select("body_text, required_checks")
    .eq("id", agreement.template_id as number)
    .maybeSingle();
  if (!tpl) return { error: "テンプレートが見つかりません" };

  // 必須チェックを検証
  const required = (tpl.required_checks as { key: string }[]) ?? [];
  for (const r of required) {
    if (!agreedChecks[r.key]) {
      return { error: "すべての確認項目にチェックを入れてください" };
    }
  }

  // 署名情報のスナップショットを作成 (改ざん防止のため body_snapshot に確定)
  const now = new Date();
  const signedAt = now.toISOString();
  const vars = (agreement.vars as Record<string, string | number>) ?? {};
  const bodySnapshot = applyAgreementVars(tpl.body_text as string, {
    ...vars,
    customer_name: signedName,
    signed_at: now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
  });

  // 監査用の IP / UA
  let signerIp: string | null = null;
  let signerUserAgent: string | null = null;
  try {
    const h = await headers();
    signerIp =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    signerUserAgent = h.get("user-agent") || null;
  } catch {
    // ignore
  }

  const { error } = await supabase
    .from("agreements")
    .update({
      status: "signed",
      signed_name: signedName,
      signature_data_url: signatureDataUrl,
      agreed_checks: agreedChecks,
      body_snapshot: bodySnapshot,
      signer_ip: signerIp,
      signer_user_agent: signerUserAgent,
      signed_at: signedAt,
      updated_at: signedAt,
    })
    .eq("uuid", uuid);
  if (error) return { error: error.message };

  // 顧客プロフィールが「会員」未満なら 1 (会員) に上げる (membership 限定)
  if (agreement.customer_id) {
    const { data: agk } = await supabase
      .from("agreements")
      .select("kind")
      .eq("id", agreement.id)
      .maybeSingle();
    if (agk?.kind === "membership") {
      const { data: c } = await supabase
        .from("customers")
        .select("type")
        .eq("id", agreement.customer_id as number)
        .maybeSingle();
      if (c && (c.type as number) === 0) {
        await supabase
          .from("customers")
          .update({ type: 1 })
          .eq("id", agreement.customer_id as number);
      }
    }
  }

  revalidatePath(`/agree/${uuid}`);
  revalidatePath(`/customer/${agreement.customer_id}`);
  revalidatePath("/agreement");
  return { success: true };
}

/**
 * 同意書リンクを LINE またはメールで顧客に送付する。
 * 顧客の line_user_id / email が埋まっていれば自動で送る。
 * どちらも無ければエラー。
 */
export async function notifyAgreement(params: {
  uuid: string;
  via: "line" | "email" | "auto";
}): Promise<{
  success?: true;
  via?: "line" | "email" | "both";
  error?: string;
}> {
  const supabase = await createClient();
  const { data: agreement } = await supabase
    .from("agreements")
    .select("id, uuid, customer_id, shop_id, status, kind")
    .eq("uuid", params.uuid)
    .is("deleted_at", null)
    .maybeSingle();
  if (!agreement) return { error: "同意書が見つかりません" };

  const [{ data: customer }, { data: shop }] = await Promise.all([
    supabase
      .from("customers")
      .select("first_name, last_name, email, line_user_id")
      .eq("id", agreement.customer_id as number)
      .maybeSingle(),
    supabase
      .from("shops")
      .select("name, line_channel_access_token")
      .eq("id", agreement.shop_id as number)
      .maybeSingle(),
  ]);
  if (!customer) return { error: "顧客が見つかりません" };

  const customerName =
    [customer.last_name, customer.first_name]
      .filter(Boolean)
      .join(" ") || "お客様";

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${baseUrl.replace(/\/$/, "")}/agree/${agreement.uuid}`;

  const isSigned = agreement.status === "signed";
  const subject = isSigned
    ? `【${shop?.name ?? "サロン"}】会員申込書 (控え)`
    : `【${shop?.name ?? "サロン"}】会員申込書のご案内`;
  const text = isSigned
    ? `${customerName} 様

ご署名いただいた会員申込書の控えです。下記リンクからいつでもご確認いただけます。

${link}

ご不明な点がございましたら店舗までお問い合わせください。`
    : `${customerName} 様

会員申込書をお送りします。下記リンクをタップ / クリックして、
内容をご確認のうえ、各項目にチェック・お名前のご入力・ご署名をお願いいたします。

${link}

※ このリンクは ${customerName} 様専用です。第三者と共有しないでください。
ご不明な点がございましたら店舗までお問い合わせください。`;

  let lineOk = false;
  let emailOk = false;

  // LINE 送信
  if (
    (params.via === "line" || params.via === "auto") &&
    customer.line_user_id &&
    shop?.line_channel_access_token
  ) {
    const r = await sendLineMessage({
      to: customer.line_user_id as string,
      text,
      channelAccessToken: shop.line_channel_access_token as string,
    });
    if (r.success) lineOk = true;
  }

  // メール送信
  if (
    (params.via === "email" || params.via === "auto") &&
    customer.email &&
    !lineOk // line で成功していたら追加送信は避ける (重複防止)
  ) {
    const r = await sendEmail({
      to: customer.email as string,
      subject,
      body: text,
      fromName: shop?.name ?? "サロン",
    });
    if (r.success) emailOk = true;
  }

  if (!lineOk && !emailOk) {
    return {
      error:
        "LINE / メールの送信先が登録されていないか、送信に失敗しました。顧客の連絡先をご確認ください。",
    };
  }

  const via = lineOk && emailOk ? "both" : lineOk ? "line" : "email";
  await supabase
    .from("agreements")
    .update({ notified_at: new Date().toISOString(), notified_via: via })
    .eq("id", agreement.id);

  revalidatePath(`/customer/${agreement.customer_id}`);
  revalidatePath("/agreement");
  return { success: true, via };
}

export async function cancelAgreement(
  uuid: string
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: ag } = await supabase
    .from("agreements")
    .select("id, customer_id")
    .eq("uuid", uuid)
    .maybeSingle();
  const { error } = await supabase
    .from("agreements")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("uuid", uuid);
  if (error) return { error: error.message };
  if (ag?.customer_id) {
    revalidatePath(`/customer/${ag.customer_id}`);
  }
  revalidatePath("/agreement");
  return { success: true };
}

export async function deleteAgreement(
  id: number
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { data: ag } = await supabase
    .from("agreements")
    .select("customer_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("agreements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  if (ag?.customer_id) {
    revalidatePath(`/customer/${ag.customer_id}`);
  }
  revalidatePath("/agreement");
  return { success: true };
}

export type AgreementKindAlias = AgreementKind;
