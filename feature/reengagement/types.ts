/** サポートするセグメントの識別子。DB にも文字列でそのまま入る。 */
export type ReengagementSegment =
  | "first_visit_30d"
  | "dormant_60d"
  | "plan_expired";

export const SEGMENT_LABELS: Record<ReengagementSegment, string> = {
  first_visit_30d: "新規 30日以内で 2回目予約なし",
  dormant_60d: "60日以上来店なし",
  plan_expired: "会員プラン満了直後",
};

export const SEGMENT_DESCRIPTIONS: Record<ReengagementSegment, string> = {
  first_visit_30d:
    "初回来店から 14〜30 日経過し、その後の予約がまだ無い顧客。離脱リスクが最も高いので、このタイミングでの再来店促進が効く。",
  dormant_60d:
    "最終来院から 60 日以上ご無沙汰の顧客。お体の変化を案内してリブッキングを促す。",
  plan_expired:
    "会員プラン (チケット / サブスク) が直近 30 日以内に終了し、継続購入がまだの顧客。プラン更新への橋渡し。",
};

export const ALL_SEGMENTS: ReengagementSegment[] = [
  "first_visit_30d",
  "dormant_60d",
  "plan_expired",
];

export interface SegmentCustomer {
  id: number;
  code: string | null;
  name: string;
  lastVisitDate: string | null;
  visitCount: number;
  lineUserId: string | null;
  email: string | null;
  phone: string | null;
  /** 直近この顧客にこのセグメントで送ったログの sent_at (ISO)。無ければ null。
   *  cooldown 判定・UI でのグレーアウト判定に使う。 */
  lastSentAt: string | null;
  /** セグメント判定で参照した補足情報 (例: プラン名、満了日) */
  note: string | null;
}

export interface ReengagementTemplate {
  id: number | null;
  brandId: number;
  shopId: number | null;
  segment: ReengagementSegment;
  title: string;
  message: string;
  couponMenuManageId: string | null;
  cooldownDays: number;
  /** TRUE なら 毎日 9:00 JST の cron (/api/cron/reengagement) で自動配信。
   *  FALSE は手動配信のみ。 */
  autoSendEnabled: boolean;
  isActive: boolean;
}
