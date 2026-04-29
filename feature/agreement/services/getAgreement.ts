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
 */
export async function getActiveTemplate(params: {
  brandId: number;
  kind: AgreementKind;
}): Promise<AgreementTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agreement_templates")
    .select("*")
    .eq("brand_id", params.brandId)
    .eq("kind", params.kind)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return parseTemplate(data);
}
