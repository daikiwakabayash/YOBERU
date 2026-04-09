"use client";

import { useMemo } from "react";
import type { CalendarData } from "../types";
import { AppointmentBlock } from "./AppointmentBlock";
import { timeToMinutes, durationToSlotCount } from "@/helper/utils/time";

interface ReservationCalendarProps {
  data: CalendarData;
  date: string;
}

export function ReservationCalendar({ data, date }: ReservationCalendarProps) {
  const { staffs, appointments, timeSlots, frameMin } = data;

  // Build a map of occupied cells for rowSpan handling
  const occupiedCells = useMemo(() => {
    const map = new Map<string, { appointment: typeof appointments[0]; slotCount: number }>();
    const skipSet = new Set<string>();

    for (const appt of appointments) {
      const startTime = appt.startAt.slice(11, 16);
      const endTime = appt.endAt.slice(11, 16);
      const slotCount = durationToSlotCount(
        timeToMinutes(endTime) - timeToMinutes(startTime),
        frameMin
      );

      // Find the starting slot index
      const startSlotIdx = timeSlots.indexOf(startTime);
      if (startSlotIdx === -1) continue;

      const key = `${startSlotIdx}-${appt.staffId}`;
      map.set(key, { appointment: appt, slotCount });

      // Mark subsequent slots as occupied
      for (let i = 1; i < slotCount; i++) {
        const skipKey = `${startSlotIdx + i}-${appt.staffId}`;
        skipSet.add(skipKey);
      }
    }

    return { map, skipSet };
  }, [appointments, timeSlots, frameMin]);

  const workingStaffs = staffs.filter((s) => s.isWorking);

  if (workingStaffs.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-muted-foreground">
        本日の出勤スタッフがいません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="sticky left-0 z-10 w-16 border-b border-r bg-gray-50 px-2 py-2 text-left text-xs font-medium text-gray-500">
              時間
            </th>
            {workingStaffs.map((staff) => (
              <th
                key={staff.id}
                className="min-w-[120px] border-b px-2 py-2 text-center text-xs font-medium"
              >
                <div>{staff.name}</div>
                {staff.shiftStart && staff.shiftEnd && (
                  <div className="text-[10px] text-muted-foreground">
                    {staff.shiftStart.slice(0, 5)}-{staff.shiftEnd.slice(0, 5)}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot, rowIdx) => {
            const isHour = slot.endsWith(":00");
            return (
              <tr
                key={slot}
                className={isHour ? "border-t border-gray-200" : ""}
              >
                <td
                  className={`sticky left-0 z-10 border-r bg-white px-2 py-1 text-xs text-gray-500 ${
                    isHour ? "font-medium" : "text-gray-300"
                  }`}
                >
                  {isHour ? slot : ""}
                </td>
                {workingStaffs.map((staff) => {
                  const cellKey = `${rowIdx}-${staff.id}`;

                  // Check if this cell is occupied by a rowSpan
                  if (occupiedCells.skipSet.has(cellKey)) return null;

                  // Check if an appointment starts here
                  const apptData = occupiedCells.map.get(cellKey);

                  if (apptData) {
                    return (
                      <td
                        key={staff.id}
                        rowSpan={apptData.slotCount}
                        className="border-r p-0.5"
                      >
                        <AppointmentBlock
                          id={apptData.appointment.id}
                          customerName={apptData.appointment.customerName}
                          menuName={apptData.appointment.menuName}
                          startTime={apptData.appointment.startAt.slice(11, 16)}
                          endTime={apptData.appointment.endAt.slice(11, 16)}
                          status={apptData.appointment.status}
                          slotCount={apptData.slotCount}
                        />
                      </td>
                    );
                  }

                  // Empty slot - check if within staff's shift hours
                  const slotMinutes = timeToMinutes(slot);
                  const shiftStart = staff.shiftStart
                    ? timeToMinutes(staff.shiftStart.slice(0, 5))
                    : null;
                  const shiftEnd = staff.shiftEnd
                    ? timeToMinutes(staff.shiftEnd.slice(0, 5))
                    : null;
                  const isWithinShift =
                    shiftStart !== null &&
                    shiftEnd !== null &&
                    slotMinutes >= shiftStart &&
                    slotMinutes < shiftEnd;

                  return (
                    <td
                      key={staff.id}
                      className={`border-r h-6 ${
                        isWithinShift
                          ? "cursor-pointer hover:bg-blue-50"
                          : "bg-gray-50"
                      }`}
                      onClick={
                        isWithinShift
                          ? () => {
                              window.location.href = `/reservation/register?staffId=${staff.id}&date=${date}&time=${slot}`;
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
