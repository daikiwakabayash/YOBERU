"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAVIGATION } from "./navigation";

/**
 * モバイル (lg 未満) で表示されるハンバーガーボタン + ドロワー。
 * デスクトップ (lg ≥) では完全非表示で、Sidebar.tsx (固定レール) が
 * 代わりに表示される。
 */
export function MobileSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ページ遷移したらドロワーを閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 lg:hidden"
        aria-label="メニューを開く"
      >
        <Menu size={22} />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">メインメニュー</SheetTitle>
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="text-lg font-bold" onClick={() => setOpen(false)}>
            YOBERU
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAVIGATION.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-gray-100 font-medium text-gray-900"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <item.icon size={18} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
