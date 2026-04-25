/**
 * 諸手当の定義テーブル。UI 描画と server action のバリデーション
 * の両方から参照される single source of truth。
 *
 * カテゴリ:
 *   - auto      … 計算サービスが条件を満たしたら自動的に金額を出す
 *                 (子供 / 誕生日 / 健康 / 住宅)。allowance_usage には
 *                 行を起こさない。
 *   - carryover … 月次条件 (税込売上 ≥ 100 万) を満たすと年内繰越可能な
 *                 枠を 10,000 円ずつ累積し、スタッフが使用額を記録する
 *                 (勉強 / イベントアクセス)。12 月リセット。
 *   - claim     … スタッフが使用額を都度入力するだけ (繰越概念なし)。
 *                 当月の入力額がそのまま当月支払額になる。Phase 2.5 で
 *                 追加された 9 種が該当。
 *
 * eligibility メモは UI に表示するヒント文字列 (条件を機械的に検証
 * するわけではない)。例えば「家族手当=入籍者のみ」は staff の入籍
 * フラグを持っていないので入力時の自己申告に依存している。
 */

export type AllowanceCategory = "auto" | "carryover" | "claim";

export type AllowanceCode =
  // Phase 2 既存
  | "study"
  | "event_access"
  // claim 型 (毎月の使用額を都度入力)
  | "health"
  | "family"
  | "commute"
  | "accommodation"
  | "referral"
  | "recruit"
  | "health_check"
  | "relocation"
  | "dental";

export interface AllowanceMeta {
  code: AllowanceCode;
  label: string;            // 表示名
  category: AllowanceCategory;
  /** 月額上限 (¥)。指定があれば server action で超過チェック (warning) */
  monthlyCapYen?: number;
  /** 受給条件のヒント (UI 表示用、システム検証ではない) */
  eligibility?: string;
  /** 補足 (UI 説明用) */
  description?: string;
}

/**
 * Phase 2 の繰越あり手当 + Phase 2.5 で追加した claim 型手当。
 * auto 型 (子供/誕生日/健康/住宅) はここには入れない (DB 行を起こさない
 * ため、計算サービス内に直接ロジックがある)。
 */
export const ALLOWANCE_META: AllowanceMeta[] = [
  {
    code: "study",
    label: "勉強代手当",
    category: "carryover",
    eligibility: "税込売上 ≥ 100 万 で月 10,000 円累積、年内繰越、12 月リセット",
  },
  {
    code: "event_access",
    label: "イベントアクセス手当",
    category: "carryover",
    eligibility: "税込売上 ≥ 100 万 で月 10,000 円累積、年内繰越、12 月リセット",
  },
  {
    code: "health",
    label: "健康手当",
    category: "claim",
    eligibility: "税込売上 ≥ 100 万 のとき (ジム代等の毎月固定額を記録)",
  },
  {
    code: "family",
    label: "家族休暇 / 手当",
    category: "claim",
    eligibility: "入籍している方",
    description: "業務委託：オーナーへ請求書、正社員：オーナーへ報告",
  },
  {
    code: "commute",
    label: "通勤手当",
    category: "claim",
    monthlyCapYen: 20000,
    eligibility: "全員 (上限 月 20,000 円)",
    description: "オーナー確認のうえ計上",
  },
  {
    code: "accommodation",
    label: "宿泊手当",
    category: "claim",
    eligibility: "本部宛へ希望日をグループメッセンジャーで依頼",
    description: "業務委託：本部へ請求書、正社員：本部へ要相談",
  },
  {
    code: "referral",
    label: "紹介手当",
    category: "claim",
    eligibility: "NAORU 在籍の先生の紹介で入社した場合 (リジョブ等の媒体経由は対象外)",
    description: "毎月 5 日までに本部へ請求書送信",
  },
  {
    code: "recruit",
    label: "リクルート手当",
    category: "claim",
    eligibility: "双方が在籍している場合",
  },
  {
    code: "health_check",
    label: "健康診断",
    category: "claim",
    eligibility: "全員 (領収書必須)",
  },
  {
    code: "relocation",
    label: "引越し手当",
    category: "claim",
    eligibility: "引越しを伴う異動がある方 (オーナーへ提出、領収書必須)",
  },
  {
    code: "dental",
    label: "歯科手当",
    category: "claim",
    eligibility: "全員 (年 2 回 FB で案内、領収書必須)",
  },
];

export const ALLOWANCE_BY_CODE: Record<AllowanceCode, AllowanceMeta> =
  ALLOWANCE_META.reduce(
    (acc, m) => {
      acc[m.code] = m;
      return acc;
    },
    {} as Record<AllowanceCode, AllowanceMeta>
  );

export const CARRYOVER_CODES = ALLOWANCE_META.filter(
  (m) => m.category === "carryover"
).map((m) => m.code);

export const CLAIM_CODES = ALLOWANCE_META.filter((m) => m.category === "claim").map(
  (m) => m.code
);

/**
 * 「現金支給ではない」福利厚生 (リゾート / オンラインサロン / 社内旅行)
 * の説明文。/payroll/[staffId] 詳細ページに参考表示する。
 */
export const NON_CASH_BENEFITS = [
  {
    label: "リゾートワークス",
    description: "全員。リゾートワークスから直接予約",
  },
  {
    label: "オンラインサロン",
    description: "全員。質問は拓磨へ",
  },
  {
    label: "社内旅行",
    description: "参加者のみ。一部本部負担",
  },
];
