"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  LayoutDashboard,
  MapPin,
  UserPlus,
  MapPinned,
  Sparkles,
  Globe,
  Megaphone,
  LineChart,
} from "lucide-react";

export type MarketingTabKey =
  | "overview"
  | "shop"
  | "new-customer"
  | "meta-ads"
  | "meta-analysis"
  | "catchment"
  | "ai"
  | "market";

const TABS: Array<{
  key: MarketingTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}> = [
  { key: "overview", label: "概要", icon: LayoutDashboard },
  { key: "new-customer", label: "新規管理", icon: UserPlus },
  { key: "meta-ads", label: "メタ広告", icon: Megaphone },
  { key: "meta-analysis", label: "メタ分析", icon: LineChart },
  { key: "catchment", label: "商圏", icon: MapPinned },
  { key: "ai", label: "AI分析", icon: Sparkles, disabled: true },
  { key: "market", label: "市場", icon: Globe, disabled: true },
  { key: "shop", label: "店舗別", icon: MapPin },
];

interface MarketingTabsProps {
  active: MarketingTabKey;
}

/**
 * Pill-style tab bar that writes `?tab=...` to the URL. Stateless — the
 * active tab is derived from the URL via the parent server component.
 * Disabled tabs (AI分析 / 市場) show "準備中" badges but can't be clicked.
 */
export function MarketingTabs({ active }: MarketingTabsProps) {
  const router = useRouter();
  const params = useSearchParams();

  const setTab = useCallback(
    (key: MarketingTabKey) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", key);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-white p-1 shadow-sm">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            disabled={tab.disabled}
            onClick={() => !tab.disabled && setTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-sm"
                : tab.disabled
                  ? "cursor-not-allowed text-gray-300"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
            {tab.disabled && (
              <span className="rounded bg-gray-100 px-1 text-[9px] font-bold text-gray-400">
                準備中
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
