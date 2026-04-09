"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getShiftColumnForDate } from "@/helper/utils/weekday";

/**
 * Get staff_shifts entries for a date range
 */
export async function getStaffShifts(
  shopId: number,
  startDate: string,
  endDate: string
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_shifts")
    .select(
      "*, work_patterns(name, abbreviation_name, abbreviation_color, start_time, end_time)"
    )
    .eq("shop_id", shopId)
    .gte("start_date", startDate)
    .lte("start_date", endDate)
    .is("deleted_at", null);
  if (error) throw error;
  return data;
}

export interface EffectiveShift {
  staffId: number;
  staffName: string;
  workPatternId: number | null;
  startTime: string | null;
  endTime: string | null;
  patternName: string | null;
  abbreviationName: string | null;
  abbreviationColor: string | null;
  isOverride: boolean;
}

/**
 * Resolve effective shift for each staff on a given date.
 * Priority: staff_shifts entry > staffs.shift_[weekday] default > work_patterns
 */
export async function getEffectiveShifts(
  shopId: number,
  date: string
): Promise<EffectiveShift[]> {
  const supabase = await createClient();

  // 1. Get all active staffs with their default shift columns
  const { data: staffs } = await supabase
    .from("staffs")
    .select(
      "id, name, shift_monday, shift_tuesday, shift_wednesday, shift_thursday, shift_friday, shift_saturday, shift_sunday, shift_holiday"
    )
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .eq("is_public", true)
    .order("allocate_order", { ascending: true, nullsFirst: false });

  // 2. Get staff_shifts overrides for this date
  const { data: overrides } = await supabase
    .from("staff_shifts")
    .select(
      "staff_id, work_pattern_id, start_time, end_time, work_patterns(name, abbreviation_name, abbreviation_color)"
    )
    .eq("shop_id", shopId)
    .eq("start_date", date)
    .is("deleted_at", null);

  // 3. Get all work_patterns for this shop (to resolve defaults)
  const { data: patterns } = await supabase
    .from("work_patterns")
    .select("*")
    .eq("shop_id", shopId)
    .is("deleted_at", null);

  if (!staffs) return [];

  const overrideMap = new Map(
    (overrides ?? []).map((o: Record<string, unknown>) => [
      o.staff_id as number,
      o,
    ])
  );
  const patternMap = new Map(
    (patterns ?? []).map((p: Record<string, unknown>) => [
      p.id as number,
      p,
    ])
  );

  // 4. For each staff, determine effective shift
  const dateObj = new Date(date + "T00:00:00");
  const shiftColumn = getShiftColumnForDate(dateObj);

  const results: EffectiveShift[] = staffs.map(
    (staff: Record<string, unknown>) => {
      const override = overrideMap.get(staff.id as number);

      if (override) {
        // Override exists for this staff + date
        const wp = override.work_patterns as Record<string, unknown> | null;
        return {
          staffId: staff.id as number,
          staffName: staff.name as string,
          workPatternId: override.work_pattern_id as number | null,
          startTime: override.start_time as string | null,
          endTime: override.end_time as string | null,
          patternName: wp ? (wp.name as string) : null,
          abbreviationName: wp ? (wp.abbreviation_name as string) : null,
          abbreviationColor: wp ? (wp.abbreviation_color as string) : null,
          isOverride: true,
        };
      }

      // Use default shift from staffs.shift_[weekday]
      const defaultPatternId = staff[shiftColumn] as number | null;
      if (defaultPatternId) {
        const pattern = patternMap.get(defaultPatternId);
        if (pattern) {
          return {
            staffId: staff.id as number,
            staffName: staff.name as string,
            workPatternId: defaultPatternId,
            startTime: pattern.start_time as string | null,
            endTime: pattern.end_time as string | null,
            patternName: pattern.name as string | null,
            abbreviationName: pattern.abbreviation_name as string | null,
            abbreviationColor: pattern.abbreviation_color as string | null,
            isOverride: false,
          };
        }
      }

      // No shift assigned (day off)
      return {
        staffId: staff.id as number,
        staffName: staff.name as string,
        workPatternId: null,
        startTime: null,
        endTime: null,
        patternName: null,
        abbreviationName: null,
        abbreviationColor: null,
        isOverride: false,
      };
    }
  );

  return results;
}
