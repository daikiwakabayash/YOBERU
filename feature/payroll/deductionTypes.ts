/**
 * 控除 (deduction) 定義テーブル。給与計算 [staffId] ページの
 * 控除入力フォーム + 集計サービスから参照される single source of truth。
 *
 * すべて「請求書合計から差し引く」値として扱う (符号は常に正)。
 */

export type DeductionCode =
  | "health_insurance"
  | "pension"
  | "long_term_care"
  | "employment_insurance"
  | "income_tax"
  | "resident_tax"
  | "other";

export interface DeductionMeta {
  code: DeductionCode;
  label: string;
  description?: string;
}

export const DEDUCTION_META: DeductionMeta[] = [
  {
    code: "health_insurance",
    label: "健康保険料",
    description: "標準報酬月額に基づく折半額 (会社負担分は除く)",
  },
  {
    code: "pension",
    label: "厚生年金保険料",
    description: "標準報酬月額に基づく折半額",
  },
  {
    code: "long_term_care",
    label: "介護保険料",
    description: "40 歳以上に発生 (健保と合算で天引)",
  },
  {
    code: "employment_insurance",
    label: "雇用保険料",
    description: "総支給額 × 料率 (一般の事業)",
  },
  {
    code: "income_tax",
    label: "所得税 (源泉)",
    description: "源泉徴収月額 (年末調整で精算)",
  },
  {
    code: "resident_tax",
    label: "住民税",
    description: "前年所得に基づく特別徴収月額",
  },
  {
    code: "other",
    label: "その他",
    description: "社宅費 / 積立金 / 立替金返済 等",
  },
];

export const DEDUCTION_BY_CODE: Record<DeductionCode, DeductionMeta> =
  DEDUCTION_META.reduce(
    (acc, m) => {
      acc[m.code] = m;
      return acc;
    },
    {} as Record<DeductionCode, DeductionMeta>
  );

export const DEDUCTION_CODES: DeductionCode[] = DEDUCTION_META.map((m) => m.code);
