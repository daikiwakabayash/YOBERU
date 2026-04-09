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
