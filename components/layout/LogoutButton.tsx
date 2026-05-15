"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/feature/auth/actions/login";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    if (!confirm("ログアウトしますか？")) return;
    setLoading(true);
    try {
      await logout();
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="ログアウト"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{loading ? "..." : "ログアウト"}</span>
    </button>
  );
}
