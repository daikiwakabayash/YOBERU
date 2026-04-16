"use client";

/**
 * Previously, this component detected browser reloads and stripped the
 * `?date=` URL parameter so the calendar always jumped back to today.
 *
 * The user requested the opposite behaviour: reloading the page while
 * viewing April 20 should keep showing April 20. So this component now
 * renders nothing and performs no side effects.
 *
 * Kept as a file rather than deleted because page.tsx imports it inside
 * a <Suspense> boundary — removing the export would break the import.
 */
export function DateResetOnReload() {
  return null;
}
