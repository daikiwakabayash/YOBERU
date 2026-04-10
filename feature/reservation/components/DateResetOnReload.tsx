"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Detects browser reloads and redirects to today's date when the URL has
 * a stale `date` query parameter.
 *
 * UX: the user wants "reload always shows today", even if the URL had a
 * past date from previous navigation. This hook checks
 * PerformanceNavigationTiming on mount — if the navigation type is "reload",
 * we strip the date param so the page re-renders with today's data.
 *
 * In-session navigation via toolbar buttons still works normally because
 * this effect only runs once (empty deps) and only on a true reload.
 */
export function DateResetOnReload() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const entries = performance.getEntriesByType(
      "navigation"
    ) as PerformanceNavigationTiming[];
    const nav = entries[0];
    if (!nav || nav.type !== "reload") return;

    const urlDate = searchParams.get("date");
    if (!urlDate) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    if (urlDate !== today) {
      // Rebuild URL with date stripped but keep other params
      const params = new URLSearchParams(searchParams.toString());
      params.delete("date");
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
