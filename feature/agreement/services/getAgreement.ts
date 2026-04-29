"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type {
  AgreementCheckClause,
  AgreementKind,
  AgreementRow,
  AgreementStatus,
  AgreementTemplate,
} from "../types";

function parseTemplate(row: Record<string, unknown>): AgreementTemplate {
  return {
    id: row.id as number,
    brandId: row.brand_id as number,
    shopId: (row.shop_id as number | null) ?? null,
    kind: row.kind as AgreementKind,
    title: row.title as string,
    bodyText: row.body_text as string,
    requiredChecks: (row.required_checks as AgreementCheckClause[]) ?? [],
    isActive: !!row.is_active,
  };
}

function parseAgreement(row: Record<string, unknown>): AgreementRow {
  return {
    id: row.id as number,
    uuid: row.uuid as string,
    brandId: row.brand_id as number,
    shopId: row.shop_id as number,
    customerId: row.customer_id as number,
    templateId: row.template_id as number,
    kind: row.kind as AgreementKind,
    vars: (row.vars as Record<string, string | number>) ?? {},
    bodySnapshot: (row.body_snapshot as string | null) ?? null,
    status: row.status as AgreementStatus,
    signedName: (row.signed_name as string | null) ?? null,
    signatureDataUrl: (row.signature_data_url as string | null) ?? null,
    agreedChecks:
      (row.agreed_checks as Record<string, boolean> | null) ?? null,
    signerIp: (row.signer_ip as string | null) ?? null,
    signerUserAgent: (row.signer_user_agent as string | null) ?? null,
    signedAt: (row.signed_at as string | null) ?? null,
    notifiedAt: (row.notified_at as string | null) ?? null,
    notifiedVia: (row.notified_via as "line" | "email" | "both" | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * UUID で 1 件取得し、テンプレート + 顧客名を結合。
 * /agree/<uuid> 公開ページ用。
 */
export async function getAgreementByUuid(uuid: string): Promise<AgreementRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agreements")
    .select("*")
    .eq("uuid", uuid)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const agreement = parseAgreement(data);

  const [tplRes, custRes] = await Promise.all([
    supabase
      .from("agreement_templates")
      .select("*")
      .eq("id", agreement.templateId)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("first_name, last_name")
      .eq("id", agreement.customerId)
      .maybeSingle(),
  ]);
  if (tplRes.data) agreement.template = parseTemplate(tplRes.data);
  if (custRes.data) {
    const first = (custRes.data.first_name as string | null) ?? "";
    const last = (custRes.data.last_name as string | null) ?? "";
    agreement.customerName = [last, first].filter(Boolean).join(" ");
  }
  return agreement;
}

/**
 * 顧客に紐付く同意書を一覧で取得。
 */
export async function getCustomerAgreements(
  customerId: number
): Promise<AgreementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agreements")
    .select("*")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(parseAgreement);
}

/**
 * 店舗単位で全契約を取得 (一覧画面用)。
 */
export async function getShopAgreements(params: {
  shopId: number;
  kind?: AgreementKind;
}): Promise<AgreementRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("agreements")
    .select("*")
    .eq("shop_id", params.shopId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (params.kind) query = query.eq("kind", params.kind);
  const { data, error } = await query;
  if (error) return [];
  const agreements = (data ?? []).map(parseAgreement);

  // 顧客名 join (1 クエリでまとめて)
  const customerIds = [...new Set(agreements.map((a) => a.customerId))];
  if (customerIds.length === 0) return agreements;
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, last_name")
    .in("id", customerIds);
  const map = new Map<number, string>();
  for (const c of customers ?? []) {
    const first = (c.first_name as string | null) ?? "";
    const last = (c.last_name as string | null) ?? "";
    map.set(c.id as number, [last, first].filter(Boolean).join(" "));
  }
  for (const a of agreements) {
    a.customerName = map.get(a.customerId) ?? `顧客 ${a.customerId}`;
  }
  return agreements;
}

/**
 * 指定 brand のアクティブテンプレートを kind 別に取得。
 *
 * 解決順:
 *   1. brand_id 完全一致のアクティブ行
 *   2. 同 kind の任意ブランド (migration の brand_id=1 で seed されたものを
 *      別ブランド運用時にも拾えるように)
 *   3. ensureCreate=true の場合、kind='membership' のデフォルトを
 *      自動シードして再取得
 */
export async function getActiveTemplate(params: {
  brandId: number;
  kind: AgreementKind;
  ensureCreate?: boolean;
}): Promise<AgreementTemplate | null> {
  const result = await getActiveTemplateWithDiagnostic(params);
  return result.template;
}

/**
 * 取得結果に加えて、なぜ null になったかの診断メッセージを返すバリエーション。
 * UI 側で「テンプレートが見つかりません」原因を顕在化させるために使う。
 */
export async function getActiveTemplateWithDiagnostic(params: {
  brandId: number;
  kind: AgreementKind;
  ensureCreate?: boolean;
}): Promise<{ template: AgreementTemplate | null; diagnostic?: string }> {
  const supabase = await createClient();

  // 1) brand 完全一致
  const exact = await supabase
    .from("agreement_templates")
    .select("*")
    .eq("brand_id", params.brandId)
    .eq("kind", params.kind)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!exact.error && exact.data) {
    return { template: parseTemplate(exact.data) };
  }
  // 致命的なエラー (table 不在等) は記録
  const exactErr = exact.error?.message ?? null;

  // 2) brand 不問でアクティブ行を探す
  const anyBrand = await supabase
    .from("agreement_templates")
    .select("*")
    .eq("kind", params.kind)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!anyBrand.error && anyBrand.data) {
    return { template: parseTemplate(anyBrand.data) };
  }
  const anyErr = anyBrand.error?.message ?? null;

  // 3) 自動シード (membership のみ)
  if (params.ensureCreate && params.kind === "membership") {
    const seed = await supabase
      .from("agreement_templates")
      .insert({
        brand_id: params.brandId,
        kind: "membership",
        title: "会員お申し込み書",
        body_text: DEFAULT_MEMBERSHIP_BODY,
        required_checks: DEFAULT_MEMBERSHIP_CHECKS,
        is_active: true,
      })
      .select("*")
      .single();
    if (!seed.error && seed.data) {
      return { template: parseTemplate(seed.data) };
    }
    const seedErr = seed.error?.message ?? "unknown";
    console.error("[agreement] seed failed", { exactErr, anyErr, seedErr });
    return {
      template: null,
      diagnostic: `テンプレート自動作成に失敗しました: ${seedErr}`,
    };
  }

  console.error("[agreement] template not found", { exactErr, anyErr });
  return {
    template: null,
    diagnostic:
      exactErr ?? anyErr ?? "テンプレートが見つからず、自動作成も無効です",
  };
}

const DEFAULT_MEMBERSHIP_BODY = `『NAORU整体 大分あけのアクロス院』会員お申し込み書

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

const DEFAULT_MEMBERSHIP_CHECKS = [
  { key: "agree_fee", label: "月額会費・クレジット契約・自動更新の内容を理解し同意します" },
  { key: "agree_eligibility", label: "入会資格 (妊娠・伝染病・変更申告) の各項目に該当・同意します" },
  { key: "agree_facility", label: "店舗利用ルール (酒気帯び・健康状態・スタッフ指示遵守) に同意します" },
  { key: "agree_withdrawal", label: "退会手続きの内容 (自動更新・前月までの申請) を理解しました" },
  { key: "agree_all", label: "上記すべてを確認のうえ、NAORU 整体 大分あけのアクロス院会員入会に同意します" },
];
