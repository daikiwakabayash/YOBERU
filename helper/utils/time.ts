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

/**
 * Round an ISO datetime string ("YYYY-MM-DDTHH:MM:SS") UP so that the
 * minute is on a clean `step`-minute boundary.
 *
 * 何のために:
 *   過去にメニューの duration が 59 分で登録されているケース (ヒューマン
 *   エラーで「60」を「59」と打ってしまったケース) で、予約の end_at が
 *   18:59 のような中途半端な時刻になってしまう。それが稼働率の計算で
 *   分母 / 分子のどちらにも余りを発生させ、見た目の % が「10分単位」で
 *   揃わない (10 / 20 / 30…)。
 *
 *   予約書込時にこのヘルパーで end_at を 5 分丸め UP することで、
 *   18:59 → 19:00 に揃え、後段の集計を綺麗な単位に倒す。
 *   start_at は UI が分単位で渡すのでここでは触らない。
 *
 *   step を 5 にしているのは「30/45/60/90 分メニューはどれも 5 分の
 *   倍数なので影響を受けない」「:59 のような端数だけ丸める」という
 *   最小副作用の選択。10 分にすると 75 分メニューが 80 分になって
 *   しまうので避ける。
 *
 *   日付ロールオーバー (23:59 → 24:00) はあえて扱わない。営業時間外
 *   で起きる極端なケースで、現実には発生しない。
 */
export function roundIsoMinuteUp(iso: string, step: number = 5): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T)(\d{2}):(\d{2})(:\d{2})?$/);
  if (!m) return iso;
  const [, datePart, hh, mm, ssRaw] = m;
  const ss = ssRaw ?? ":00";
  const hour = Number(hh);
  const minute = Number(mm);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return iso;
  const remainder = minute % step;
  if (remainder === 0) return iso;
  let newMinute = minute + (step - remainder);
  let newHour = hour;
  if (newMinute >= 60) {
    newMinute -= 60;
    newHour += 1;
  }
  if (newHour >= 24) {
    // 24h ロールオーバーは想定外。元の値を返してデータを破壊しない。
    return iso;
  }
  return `${datePart}${String(newHour).padStart(2, "0")}:${String(
    newMinute
  ).padStart(2, "0")}${ss}`;
}
