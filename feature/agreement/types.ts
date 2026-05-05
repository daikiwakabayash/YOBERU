/**
 * 電子契約 (会員申込書 / 領収書 / 同意書 等) の型定義。
 */

export type AgreementKind = "membership" | "receipt" | "consent" | "other";
export type AgreementStatus = "pending" | "signed" | "cancelled";

export interface AgreementCheckClause {
  key: string;
  label: string;
}

export interface AgreementTemplate {
  id: number;
  brandId: number;
  shopId: number | null;
  kind: AgreementKind;
  title: string;
  bodyText: string;
  requiredChecks: AgreementCheckClause[];
  isActive: boolean;
}

export interface AgreementRow {
  id: number;
  uuid: string;
  brandId: number;
  shopId: number;
  customerId: number;
  templateId: number;
  kind: AgreementKind;
  vars: Record<string, string | number>;
  bodySnapshot: string | null;
  status: AgreementStatus;
  signedName: string | null;
  signatureDataUrl: string | null;
  agreedChecks: Record<string, boolean> | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  signedAt: string | null;
  notifiedAt: string | null;
  notifiedVia: "line" | "email" | "both" | null;
  createdAt: string;
  /** template から動的に注入 */
  template?: AgreementTemplate;
  /** 顧客名 (一覧表示用) */
  customerName?: string;
}

export const AGREEMENT_KIND_LABEL: Record<AgreementKind, string> = {
  membership: "会員申込書",
  receipt: "領収書",
  consent: "同意書",
  other: "その他",
};

export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  pending: "未署名",
  signed: "署名済み",
  cancelled: "取消",
};

/**
 * テンプレート本文の {{placeholder}} を vars で置換する純粋関数。
 * 未対応のプレースホルダはそのまま残す (誤入力検知のヒント)。
 */
export function applyAgreementVars(
  body: string,
  vars: Record<string, string | number | undefined | null>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    return String(v);
  });
}

/**
 * vars を「派生変数も埋まった状態」に拡張する。
 *
 * 派生ルール:
 *   contract_start_date があって next_billing_date が無い場合、
 *   contract_start_date + 1 ヶ月で自動計算して埋める。
 *
 * 既存 vars にユーザー指定値があればそれを優先する。
 * フォーム送信側の漏れ・古い同意書テンプレートの両方に効く。
 *
 * computeNextBillingDate は utils/nextBillingDate.ts に分離 (main 側で
 * 同名 util が既に存在するためそちらに合流)。
 */
import { computeNextBillingDate } from "./utils/nextBillingDate";

export function withDerivedAgreementVars(
  vars: Record<string, string | number | undefined | null>
): Record<string, string | number | undefined | null> {
  const out = { ...vars };
  if (
    (out.next_billing_date === undefined ||
      out.next_billing_date === null ||
      out.next_billing_date === "") &&
    typeof out.contract_start_date === "string" &&
    out.contract_start_date
  ) {
    const nb = computeNextBillingDate(out.contract_start_date);
    if (nb) out.next_billing_date = nb;
  }
  return out;
}
