import {
  CalendarDays,
  Users,
  UserCog,
  Utensils,
  Building2,
  Clock,
  BarChart3,
  Settings,
  Layers,
  Grid3X3,
  Link2,
  Code2,
  CreditCard,
  Megaphone,
  ClipboardList,
  Wallet,
  Sparkles,
  Crown,
  CalendarX2,
  HeartHandshake,
  MessageCircle,
  Calculator,
  Fingerprint,
  CalendarCheck,
  Gift,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * サイドバー (デスクトップ) と モバイルドロワーの両方が参照するメニュー定義。
 * ここを 1 箇所更新するだけで両方に反映される。
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: "予約管理",
    items: [
      { name: "予約表", href: "/reservation", icon: CalendarDays },
      { name: "強制リンク作成", href: "/booking-link", icon: Link2 },
      { name: "タグテンプレート", href: "/tag-template", icon: Code2 },
    ],
  },
  {
    label: "顧客管理",
    items: [
      { name: "顧客一覧", href: "/customer", icon: Users },
      { name: "LINE チャット", href: "/line-chat", icon: MessageCircle },
    ],
  },
  {
    label: "マスタ管理",
    items: [
      { name: "店舗", href: "/store", icon: Building2 },
      { name: "スタッフ", href: "/staff", icon: UserCog },
      { name: "メニューカテゴリ", href: "/menu-category", icon: Layers },
      { name: "メニュー", href: "/menu", icon: Utensils },
      { name: "設備", href: "/facility", icon: Grid3X3 },
      { name: "支払方法", href: "/payment-method", icon: CreditCard },
      { name: "来店経路", href: "/visit-source", icon: Megaphone },
      { name: "予約ブロック種別", href: "/slot-block-type", icon: CalendarX2 },
      { name: "問診票", href: "/questionnaire", icon: ClipboardList },
      { name: "広告費", href: "/ad-spend", icon: Wallet },
    ],
  },
  {
    label: "シフト管理",
    items: [
      { name: "出勤パターン", href: "/shift-pattern", icon: Settings },
      { name: "出勤表", href: "/shift-schedule", icon: Clock },
    ],
  },
  {
    label: "勤怠管理",
    items: [
      { name: "Web 打刻", href: "/punch", icon: Fingerprint },
      { name: "勤怠記録", href: "/time-tracking", icon: Clock },
      { name: "有給休暇", href: "/paid-leave", icon: CalendarCheck },
    ],
  },
  {
    label: "給与・請求",
    items: [
      { name: "給与計算", href: "/payroll", icon: Calculator },
      { name: "福利厚生", href: "/benefits", icon: Gift },
    ],
  },
  {
    label: "分析",
    items: [
      { name: "経営指標", href: "/kpi", icon: Crown },
      { name: "売上", href: "/sales", icon: BarChart3 },
      { name: "マーケティング", href: "/marketing", icon: Sparkles },
      { name: "再来店促進", href: "/reengagement", icon: HeartHandshake },
    ],
  },
];
