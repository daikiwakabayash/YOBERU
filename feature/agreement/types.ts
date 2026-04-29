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
