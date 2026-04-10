"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Users,
  UserCog,
  Utensils,
  Building2,
  Clock,
  LayoutDashboard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  {
    label: "予約管理",
    items: [
      { name: "予約表", href: "/reservation", icon: CalendarDays },
    ],
  },
  {
    label: "顧客管理",
    items: [
      { name: "顧客一覧", href: "/customer", icon: Users },
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
    label: "分析",
    items: [
      { name: "売上", href: "/sales", icon: BarChart3 },
      { name: "ダッシュボード", href: "/", icon: LayoutDashboard },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/" className="text-lg font-bold">
            YOBERU
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 hover:bg-gray-100"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {navigation.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-gray-100 font-medium text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon size={18} />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
