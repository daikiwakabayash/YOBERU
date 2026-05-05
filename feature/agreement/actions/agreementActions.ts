"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/helper/lib/supabase/server";
import { sendEmail } from "@/helper/lib/email/sendEmail";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";
import {
  applyAgreementVars,
  withDerivedAgreementVars,
  type AgreementKind,
} from "../types";
import { computeNextBillingDate } from "../utils/nextBillingDate";

/**
 * 顧客向けに新しい同意書 (会員申込書 等) のリンクを発行する。
 * /agree/<uuid> を LINE / メールで送ると顧客が署名できる。
 *
 * ID/PW を発行しない代わりに、UUID 自体が秘密鍵的な役割を担う
 * (推測困難な v4 UUID)。
 *
 * finalizeOnCreate=true (領収書) のときは発行時点で status=signed に
 * 確定させる。日本の領収書慣行では発行者 (= 店舗) が単独で発行する
 * ものなので、顧客側の署名は不要。
 */
export async function createAgreement(params: {
  customerId: number;
  templateId: number;
  /** 月額 / 契約開始日 等、本文プレースホルダーに埋める変数 */
  vars: Record<string, string | number>;
  finalizeOnCreate?: boolean;
}): Promise<{ success?: true; uuid?: string; error?: string }> {
  const supabase = await createClient();

  // template の brand_id / shop_id / kind / body_text を取得
  // (finalize 時に body_snapshot を確定するため body_text も必要)
  const { data: tpl } = await supabase
    .from("agreement_templates")
    .select("id, brand_id, shop_id, kind, body_text")
    .eq("id", params.templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tpl) return { error: "テンプレートが見つかりません" };

  const { data: customer } = await supabase
    .from("customers")
    .select("id, brand_id, shop_id, first_name, last_name")
    .eq("id", params.customerId)
    .maybeSingle();
  if (!customer) return { error: "顧客が見つかりません" };

  const customerName =
    [customer.last_name, customer.first_name].filter(Boolean).join(" ") || "";

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

  // contract_start_date があり next_billing_date が未指定なら自動算出
  // (クライアント側で算出済みでも上書きしない)
  const enrichedVars: Record<string, string | number> = { ...params.vars };
  const startDate =
    typeof enrichedVars.contract_start_date === "string"
      ? enrichedVars.contract_start_date
      : "";
  if (
    startDate &&
    (!enrichedVars.next_billing_date || enrichedVars.next_billing_date === "")
  ) {
    const next = computeNextBillingDate(startDate);
    if (next) enrichedVars.next_billing_date = next;
  }

  const insertPayload: Record<string, unknown> = {
    uuid: newUuid,
    brand_id: customer.brand_id ?? tpl.brand_id,
    shop_id: customer.shop_id,
    customer_id: params.customerId,
    template_id: params.templateId,
    kind: tpl.kind,
    vars: enrichedVars,
    status: "pending",
    created_by_user_id: createdByUserId,
  };

  if (params.finalizeOnCreate) {
    const now = new Date();
    const bodySnapshot = applyAgreementVars(tpl.body_text as string, {
      ...enrichedVars,
      customer_name: customerName,
      signed_at: now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    });
    insertPayload.status = "signed";
    insertPayload.signed_at = now.toISOString();
    insertPayload.signed_name = customerName || "発行済み";
    insertPayload.body_snapshot = bodySnapshot;
    insertPayload.agreed_checks = {};
  }

  const { error } = await supabase.from("agreements").insert(insertPayload);
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
  // contract_start_date しか入っていない古いリンクでも
  // next_billing_date を自動計算で埋めて snapshot する。
  const enrichedVars = withDerivedAgreementVars({
    ...vars,
    customer_name: signedName,
    signed_at: now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
  });
  const bodySnapshot = applyAgreementVars(
    tpl.body_text as string,
    enrichedVars
  );

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
        "顧客の LINE / メール どちらも未登録、または送信に失敗しました。" +
        "「リンクコピー」または「印刷 / PDF保存」から控えを共有してください。",
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

/**
 * 会員申込書テンプレートを手動でセットアップする (UI ボタンから呼ぶ用)。
 * - 既存があればその id を返す
 * - 無ければ NAORU デフォルト本文で新規作成
 * - 失敗した場合は具体的なエラー文 (テーブル不在 / RLS / 権限 等) を返す
 */
export async function setupMembershipTemplate(params: {
  brandId: number;
}): Promise<{ success?: true; error?: string; templateId?: number }> {
  const supabase = await createClient();

  const existing = await supabase
    .from("agreement_templates")
    .select("id")
    .eq("kind", "membership")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing.error && existing.data) {
    return { success: true, templateId: existing.data.id as number };
  }

  // 既存が無い → 新規作成
  const body = `『NAORU整体 大分あけのアクロス院』会員お申し込み書

ご入会いただく皆様に下記の内容をご確認いただいております。
内容をよくお読みいただき、確認欄へチェック及び署名の記入をお願いします。

【会費・契約】
●当会員制度は月額 {{plan_amount_yen}} 円（税込）の会費をお支払いただく事により、当院で提供する「会員専用プログラム」が会員価格でご利用いただけるようになるサービスです。
●契約期間 {{contract_start_date}} 〜
●当制度はクレジット契約による引き落としとなります。尚、特段のお申し出がない限り、契約は更新されるものとします。
  自動的に利用継続となり月額 {{plan_amount_yen}} 円（税込）が引き落とされます。
●翌月以降、入会日が更新日となります。
※消費しきれなかった回数は次月まで繰り越し可能です。
※プラン変更や退会希望の場合、申請月の翌月に反映されます。
  例：1 月に退会希望の場合は 12 月末までに当院にて所定会員種別変更手続きをお願いいたします。
●当日キャンセルの場合は、1 回分消費となります。ご予約の変更、キャンセルについては前日までにお願いいたします。
●遅刻された場合は、施術時間が短縮されますので、ご予約時間の 5 分前など、スムーズにご案内させていただけるよう、お時間に余裕をもってお越しください。

【入会資格について】
・私は現在、妊娠していません（契約期間中に妊娠した場合は遅延なく申し出ます）
・私は他人に伝染する恐れのある疾病等にかかっていません（契約期間中に上記の疾病等にかかった場合は遅延なく申し出ます）
・私は現在の健康状態、会員資格及び入会申込書に記載した内容（住所・銀行口座・クレジットカード番号）に変更が生じた場合は遅延なく申し出ます

【店舗の利用について】
●下記の項目に該当すると判断された場合には店舗への入場をお断りすることを了承します。
・酒気を帯びている
・健康状態を害しており施術に不適切な状態のとき
・正当な理由なく当店のスタッフの指示に従わないとき

【退会の手続きについて】
・会員様の事情により退会される場合は、解約のお手続きが必要になります。解約のお手続きがお済でない場合は自動的に契約が更新されます。1 度も来院されなかった月に関しても、退会手続きがお済でない場合は返金致しかねますのであらかじめご了承ください。

※退会ご希望の際は、退会希望月の前月までにご本人様がご来院の上、退会手続きを行ってください。手続きがお済でない場合は会費支払いの義務が発生するものとします。

【お申込み者氏名】 {{customer_name}}
【お申込み日】 {{signed_at}}

院長 東川 幸平`;

  const checks = [
    { key: "agree_fee", label: "月額会費・クレジット契約・自動更新の内容を理解し同意します" },
    { key: "agree_eligibility", label: "入会資格 (妊娠・伝染病・変更申告) の各項目に該当・同意します" },
    { key: "agree_facility", label: "店舗利用ルール (酒気帯び・健康状態・スタッフ指示遵守) に同意します" },
    { key: "agree_withdrawal", label: "退会手続きの内容 (自動更新・前月までの申請) を理解しました" },
    { key: "agree_all", label: "上記すべてを確認のうえ、NAORU 整体 大分あけのアクロス院会員入会に同意します" },
  ];

  const created = await supabase
    .from("agreement_templates")
    .insert({
      brand_id: params.brandId,
      kind: "membership",
      title: "会員お申し込み書",
      body_text: body,
      required_checks: checks,
      is_active: true,
    })
    .select("id")
    .single();

  if (created.error) {
    const msg = created.error.message ?? "";
    const low = msg.toLowerCase();
    // RLS は最優先で判定 (メッセージに table 名が含まれるため、後段の
    // 「テーブル不在」判定に取られないよう順序が重要)
    if (
      low.includes("row-level security") ||
      low.includes("row level security")
    ) {
      return {
        error:
          "Supabase の RLS で INSERT が拒否されました。Supabase ダッシュボード → Authentication → Policies → agreement_templates / agreements の RLS を OFF にする (または migration 00042 を再実行する) と解消します。",
      };
    }
    if (
      low.includes("does not exist") ||
      low.includes("schema cache") ||
      low.includes("relation")
    ) {
      return {
        error:
          "agreement_templates テーブルが存在しません。Supabase ダッシュボード → SQL Editor で migration 00042_agreements.sql を最後まで実行してください。",
      };
    }
    return { error: `テンプレート作成に失敗: ${msg}` };
  }

  return { success: true, templateId: created.data.id as number };
}

/**
 * 領収書テンプレートを手動でセットアップする。
 * setupMembershipTemplate と同じパターンで、kind='receipt' を作成する。
 */
export async function setupReceiptTemplate(params: {
  brandId: number;
}): Promise<{ success?: true; error?: string; templateId?: number }> {
  const supabase = await createClient();

  const existing = await supabase
    .from("agreement_templates")
    .select("id")
    .eq("kind", "receipt")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing.error && existing.data) {
    return { success: true, templateId: existing.data.id as number };
  }

  const body = `領収書

発行日: {{issue_date}}

{{customer_name}} 様

下記の通り、正に領収いたしました。

────────────────────────
  金額: ¥{{amount_yen}}
  但し: {{purpose}}
────────────────────────

NAORU 整体 大分あけのアクロス院
院長 東川 幸平 印`;

  const created = await supabase
    .from("agreement_templates")
    .insert({
      brand_id: params.brandId,
      kind: "receipt",
      title: "領収書",
      body_text: body,
      required_checks: [],
      is_active: true,
    })
    .select("id")
    .single();

  if (created.error) {
    const msg = created.error.message ?? "";
    const low = msg.toLowerCase();
    if (
      low.includes("row-level security") ||
      low.includes("row level security")
    ) {
      return {
        error:
          "Supabase の RLS で INSERT が拒否されました。SQL Editor で「ALTER TABLE agreement_templates DISABLE ROW LEVEL SECURITY;」を実行してください。",
      };
    }
    return { error: `テンプレート作成に失敗: ${msg}` };
  }

  revalidatePath("/agreement/template");
  return { success: true, templateId: created.data.id as number };
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

/**
 * テンプレート本体 (タイトル / 本文 / 確認項目) を更新する。
 *
 * 既存の署名済み契約 (agreements.body_snapshot) には影響しない —
 * テンプレートの編集は「次に発行するリンクから」反映される設計。
 */
export async function updateAgreementTemplate(params: {
  id: number;
  title: string;
  bodyText: string;
  requiredChecks: { key: string; label: string }[];
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const { id, title, bodyText, requiredChecks } = params;

  if (!title.trim()) return { error: "タイトルを入力してください" };
  if (!bodyText.trim()) return { error: "本文を入力してください" };

  // チェック項目のバリデーション
  const seenKeys = new Set<string>();
  for (const c of requiredChecks) {
    if (!c.key.trim() || !c.label.trim()) {
      return { error: "チェック項目の key / label は両方入力してください" };
    }
    if (!/^[a-z0-9_]+$/i.test(c.key)) {
      return {
        error: `チェック項目の key "${c.key}" は半角英数字とアンダースコアのみ使えます`,
      };
    }
    if (seenKeys.has(c.key)) {
      return { error: `チェック項目の key "${c.key}" が重複しています` };
    }
    seenKeys.add(c.key);
  }

  const { error } = await supabase
    .from("agreement_templates")
    .update({
      title: title.trim(),
      body_text: bodyText,
      required_checks: requiredChecks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/agreement");
  revalidatePath("/agreement/template");
  return { success: true };
}
