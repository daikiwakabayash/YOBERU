"use server";

import { createClient } from "@/helper/lib/supabase/server";
import {
  timeToMinutes,
  minutesToTime,
  timeRangesOverlap,
} from "@/helper/utils/time";

export interface AvailableSlot {
  staffId: number;
  staffName: string;
  startTime: string;
  endTime: string;
}

interface GetAvailableSlotsParams {
  shopId: number;
  date: string;
  menuManageId: string;
  staffId?: number;
  frameMin: number;
}

/**
 * Calculate available time slots for a given date, menu, and optionally a specific staff.
 * This is the core availability engine.
 */
export async function getAvailableSlots(
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const { shopId, date, menuManageId, staffId, frameMin } = params;
  const supabase = await createClient();

  // 1. Get menu to determine duration
  const { data: menu } = await supabase
    .from("menus")
    .select("duration, menu_manage_id")
    .eq("menu_manage_id", menuManageId)
    .is("deleted_at", null)
    .single();

  if (!menu) return [];
  const duration = menu.duration;

  // 2. Get effective shifts for each staff on this date
  // Import getEffectiveShifts dynamically to avoid circular deps
  const { getEffectiveShifts } = await import(
    "@/feature/shift/services/getStaffShifts"
  );
  const effectiveShifts = await getEffectiveShifts(shopId, date);

  // Filter to specific staff if requested
  const shiftsToCheck = staffId
    ? effectiveShifts.filter((s) => s.staffId === staffId)
    : effectiveShifts;

  // 3. Get existing appointments for this date
  const { data: appointments } = await supabase
    .from("appointments")
    .select("staff_id, start_at, end_at, menu_manage_id")
    .eq("shop_id", shopId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${date}T23:59:59`)
    .is("cancelled_at", null)
    .is("deleted_at", null);

  const existingAppointments = appointments ?? [];

  // 4. Get facility constraints for this menu
  const { data: menuFacilities } = await supabase
    .from("menu_facilities")
    .select("facility_id")
    .eq("menu_manage_id", menuManageId);

  let facilityConstraints: Array<{
    facilityId: number;
    maxBookCount: number;
  }> = [];

  if (menuFacilities && menuFacilities.length > 0) {
    const facilityIds = menuFacilities.map((mf) => mf.facility_id);
    const { data: facilities } = await supabase
      .from("facilities")
      .select("id, max_book_count")
      .in("id", facilityIds)
      .is("deleted_at", null);

    facilityConstraints = (facilities ?? []).map((f) => ({
      facilityId: f.id,
      maxBookCount: f.max_book_count,
    }));
  }

  // 5. For each staff, calculate available slots
  const results: AvailableSlot[] = [];

  for (const shift of shiftsToCheck) {
    if (!shift.startTime || !shift.endTime) continue; // Not working

    const shiftStartMin = timeToMinutes(shift.startTime);
    const shiftEndMin = timeToMinutes(shift.endTime);

    // Get this staff's existing appointments
    const staffAppts = existingAppointments.filter(
      (a) => a.staff_id === shift.staffId
    );

    // Generate candidate start times at frameMin intervals
    for (
      let candidateStart = shiftStartMin;
      candidateStart + duration <= shiftEndMin;
      candidateStart += frameMin
    ) {
      const candidateEnd = candidateStart + duration;
      const candidateStartStr = minutesToTime(candidateStart);
      const candidateEndStr = minutesToTime(candidateEnd);
      const candidateStartISO = `${date}T${candidateStartStr}:00`;
      const candidateEndISO = `${date}T${candidateEndStr}:00`;

      // Check overlap with existing appointments for this staff
      const hasConflict = staffAppts.some((appt) => {
        const apptStart = appt.start_at.slice(11, 16);
        const apptEnd = appt.end_at.slice(11, 16);
        return timeRangesOverlap(
          candidateStartStr,
          candidateEndStr,
          apptStart,
          apptEnd
        );
      });

      if (hasConflict) continue;

      // Check facility constraints
      if (facilityConstraints.length > 0) {
        // For each required facility, count concurrent usage
        const facilityAvailable = facilityConstraints.every((fc) => {
          // Count appointments at this time that also use a menu requiring the same facility
          // This is a simplified check - in production, you'd cross-reference menu_facilities
          const concurrentCount = existingAppointments.filter((appt) => {
            const apptStart = appt.start_at.slice(11, 16);
            const apptEnd = appt.end_at.slice(11, 16);
            return timeRangesOverlap(
              candidateStartStr,
              candidateEndStr,
              apptStart,
              apptEnd
            );
          }).length;
          return concurrentCount < fc.maxBookCount;
        });

        if (!facilityAvailable) continue;
      }

      results.push({
        staffId: shift.staffId,
        staffName: shift.staffName,
        startTime: candidateStartStr,
        endTime: candidateEndStr,
      });
    }
  }

  // Sort by time, then by staff name
  results.sort((a, b) => {
    if (a.startTime !== b.startTime)
      return a.startTime.localeCompare(b.startTime);
    return a.staffName.localeCompare(b.staffName);
  });

  return results;
}
