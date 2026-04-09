/**
 * Format a date to Japanese locale string (YYYY年MM月DD日)
 */
export function formatDateJP(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a date to YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Format time to HH:MM
 */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}
