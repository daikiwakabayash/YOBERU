/**
 * 福利厚生 (正社員共通) マスタ。
 *
 * - 正社員 (employment_type='regular') に対しては、ここに掲載した
 *   ものすべてが等しく適用される (= 全員共通)。
 * - 業務委託 (contractor) は contractor: true のものだけが対象。
 * - 「現金支給」されるものは allowanceTypes / deductionTypes と
 *   重複するが、本マスタは「正社員に何が用意されているか」を一覧で
 *   見せる目的の整理表として独立して持つ。
 *
 * カテゴリ:
 *   - leave    休暇制度 (有給 / 慶弔 / 出産育児 等)
 *   - cash     現金支給される手当 (通勤 / 住宅 / 子供 等)
 *   - benefit  非現金の福利厚生 (社員旅行 / オンラインサロン 等)
 *   - insurance 保険・年金 (健保 / 厚年 / 雇用保険 / 労災)
 */

export type BenefitCategory = "leave" | "cash" | "benefit" | "insurance";

export interface BenefitItem {
  category: BenefitCategory;
  title: string;
  description: string;
  /** 業務委託にも提供される項目は true */
  contractor: boolean;
  /** 関連する allowance/deduction の code など (内部リンク用) */
  refCode?: string;
}

export const BENEFITS: BenefitItem[] = [
  // ----- 休暇制度 -----
  {
    category: "leave",
    title: "年次有給休暇",
    description:
      "労基法に基づき入社 6 ヶ月で 10 日付与、以降 1 年ごとに逓増 (最大 20 日)。単位は 1 日 / 半休 (午前 or 午後)。時間単位の取得は不可。",
    contractor: false,
  },
  {
    category: "leave",
    title: "慶弔休暇",
    description: "本人結婚 5 日 / 配偶者出産 3 日 / 一親等死亡 5 日 / 二親等死亡 2 日。",
    contractor: false,
  },
  {
    category: "leave",
    title: "産前産後・育児休業",
    description: "労基法 / 育児介護休業法に基づく。本人申請ベースで本部が手続き対応。",
    contractor: false,
  },
  {
    category: "leave",
    title: "介護休業",
    description: "対象家族 1 人につき通算 93 日まで取得可。",
    contractor: false,
  },

  // ----- 保険・年金 (法定) -----
  {
    category: "insurance",
    title: "健康保険 (会社折半)",
    description: "標準報酬月額に応じた健保料の半額を会社負担。",
    contractor: false,
  },
  {
    category: "insurance",
    title: "厚生年金 (会社折半)",
    description: "標準報酬月額に応じた厚年料の半額を会社負担。",
    contractor: false,
  },
  {
    category: "insurance",
    title: "雇用保険",
    description: "失業給付・教育訓練給付・育児休業給付の加入。",
    contractor: false,
  },
  {
    category: "insurance",
    title: "労災保険",
    description: "業務上 / 通勤上の負傷・疾病に対して全額会社負担で加入。",
    contractor: false,
  },

  // ----- 現金支給される手当 -----
  {
    category: "cash",
    title: "通勤手当",
    description: "上限 月 20,000 円。オーナー確認のうえ計上。",
    contractor: true,
    refCode: "commute",
  },
  {
    category: "cash",
    title: "住宅手当",
    description: "税込売上 100 万達成月に月 20,000 円を自動付与。",
    contractor: true,
    refCode: "housing",
  },
  {
    category: "cash",
    title: "美容手当",
    description: "税込売上 100 万達成月に月 10,000 円を自動付与。",
    contractor: true,
    refCode: "beauty",
  },
  {
    category: "cash",
    title: "子供手当",
    description: "1 人につき月 5,000 円。スタッフ属性 (children_count) で自動計算。",
    contractor: true,
    refCode: "children",
  },
  {
    category: "cash",
    title: "誕生日手当",
    description: "誕生月に 10,000 円を自動付与。",
    contractor: true,
    refCode: "birthday",
  },
  {
    category: "cash",
    title: "勉強代手当",
    description:
      "税込売上 100 万達成月ごとに 10,000 円を年内累積。書籍 / 研修 / セミナーの実費に充当。12 月リセット。",
    contractor: true,
    refCode: "study",
  },
  {
    category: "cash",
    title: "イベントアクセス手当",
    description:
      "税込売上 100 万達成月ごとに 10,000 円を年内累積。イベント参加交通費・宿泊・チケット代に充当。12 月リセット。",
    contractor: true,
    refCode: "event_access",
  },
  {
    category: "cash",
    title: "健康手当",
    description: "ジム代等の健康投資に対する月固定額の手当 (領収書ベース)。",
    contractor: true,
    refCode: "health",
  },
  {
    category: "cash",
    title: "家族休暇 / 手当",
    description: "入籍されている方が対象。",
    contractor: true,
    refCode: "family",
  },
  {
    category: "cash",
    title: "宿泊手当",
    description: "本部宛にグループメッセンジャーで申請。",
    contractor: true,
    refCode: "accommodation",
  },
  {
    category: "cash",
    title: "紹介手当",
    description:
      "NAORU 在籍の先生の紹介で入社した場合。毎月 5 日までに本部へ請求書送信。",
    contractor: true,
    refCode: "referral",
  },
  {
    category: "cash",
    title: "リクルート手当",
    description: "双方が在籍している場合。",
    contractor: true,
    refCode: "recruit",
  },
  {
    category: "cash",
    title: "健康診断",
    description: "全員。領収書必須。",
    contractor: true,
    refCode: "health_check",
  },
  {
    category: "cash",
    title: "引越し手当",
    description: "引越しを伴う異動がある方が対象。領収書必須。",
    contractor: true,
    refCode: "relocation",
  },
  {
    category: "cash",
    title: "歯科手当",
    description: "全員。年 2 回 FB で案内、領収書必須。",
    contractor: true,
    refCode: "dental",
  },

  // ----- 非現金の福利厚生 -----
  {
    category: "benefit",
    title: "リゾートワークス",
    description: "全員。リゾートワークスから直接予約。",
    contractor: true,
  },
  {
    category: "benefit",
    title: "オンラインサロン",
    description: "全員。質問は拓磨へ。",
    contractor: true,
  },
  {
    category: "benefit",
    title: "社内旅行",
    description: "参加者のみ。一部本部負担。",
    contractor: true,
  },
];

export const CATEGORY_LABEL: Record<BenefitCategory, string> = {
  leave: "休暇制度",
  insurance: "保険・年金",
  cash: "手当 (現金支給)",
  benefit: "非現金の福利厚生",
};

export const CATEGORY_ORDER: BenefitCategory[] = [
  "leave",
  "insurance",
  "cash",
  "benefit",
];
