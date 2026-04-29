"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * /agreement と /agreement/template の上部に共通で出すタブナビ。
 */
export function AgreementTopTabs() {
  const pathname = usePathname();
  const onTemplate = pathname.startsWith("/agreement/template");
  return (
    <div className="flex gap-2 border-b">
      <Link
        href="/agreement"
        className={cn(
          "border-b-2 px-3 py-2 text-sm transition-colors",
          !onTemplate
            ? "border-gray-900 font-bold text-gray-900"
            : "border-transparent text-gray-500 hover:text-gray-700"
        )}
      >
        署名済み一覧
      </Link>
      <Link
        href="/agreement/template"
        className={cn(
          "border-b-2 px-3 py-2 text-sm transition-colors",
          onTemplate
            ? "border-gray-900 font-bold text-gray-900"
            : "border-transparent text-gray-500 hover:text-gray-700"
        )}
      >
        テンプレート編集
      </Link>
    </div>
  );
}
