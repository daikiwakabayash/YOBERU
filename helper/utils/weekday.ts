/**
 * Maps Date.getDay() (0=Sunday) to staff table column names
 */
export const WEEKDAY_SHIFT_COLUMNS = [
  "shift_sunday",
  "shift_monday",
  "shift_tuesday",
  "shift_wednesday",
  "shift_thursday",
  "shift_friday",
  "shift_saturday",
] as const;

export const WEEKDAY_LABELS_JP = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const;

/**
 * Get the shift column name for a given date
 */
export function getShiftColumnForDate(
  date: Date
): (typeof WEEKDAY_SHIFT_COLUMNS)[number] {
  return WEEKDAY_SHIFT_COLUMNS[date.getDay()];
}

/**
 * Get the Monday-to-Sunday dates for the week containing the given date
 */
export function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = [];
  const day = baseDate.getDay();
  // Adjust to Monday (day 1). If Sunday (0), go back 6 days.
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * Get the Japanese weekday label for a date
 */
export function getWeekdayLabel(date: Date): string {
  return WEEKDAY_LABELS_JP[date.getDay()];
}
