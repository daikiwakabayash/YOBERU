/**
 * Generate time slots for a given interval (in minutes)
 */
export function generateTimeSlots(
  startHour: number,
  endHour: number,
  intervalMinutes: number
): string[] {
  const slots: string[] = [];
  let current = startHour * 60;
  const end = endHour * 60;

  while (current < end) {
    const hours = Math.floor(current / 60);
    const minutes = current % 60;
    slots.push(
      `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
    );
    current += intervalMinutes;
  }

  return slots;
}

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Convert "HH:MM" string to minutes from midnight
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes from midnight to "HH:MM" string
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Format a Date as "YYYY-MM-DD" in Asia/Tokyo timezone.
 *
 * This is critical for correct date rendering because:
 * - Vercel (and most cloud hosts) run Node.js in UTC.
 * - `d.getFullYear()` / `getMonth()` / `getDate()` use the server's local TZ.
 * - Between 00:00-08:59 JST the UTC date is the previous day, so the naive
 *   approach shows yesterday in Japan mornings.
 *
 * We always format in Asia/Tokyo to ensure "today in Japan" is computed
 * consistently on the server.
 */
export function toLocalDateString(d: Date = new Date()): string {
  // 'en-CA' locale returns YYYY-MM-DD format; timeZone forces Asia/Tokyo.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Calculate how many time slots a duration spans
 */
export function durationToSlotCount(
  durationMinutes: number,
  frameMin: number
): number {
  return Math.ceil(durationMinutes / frameMin);
}
