"use client";

import { useMemo, useState, useEffect } from "react";
import type { CalendarData, CalendarAppointment } from "../types";
import { timeToMinutes } from "@/helper/utils/time";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";

interface ReservationCalendarProps {
  data: CalendarData;
  date: string;
}

const SLOT_HEIGHT = 44; // px per 30min slot equivalent
const TIME_COL_WIDTH = 76;
const STAFF_COL_WIDTH = 260;

export function ReservationCalendar({ data, date }: ReservationCalendarProps) {
  const { staffs, appointments, timeSlots, frameMin } = data;
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  // Current time indicator
  useEffect(() => {
    function updateNow() {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }
    updateNow();
    const interval = setInterval(updateNow, 60000);
    return () => clearInterval(interval);
  }, []);

  const workingStaffs = staffs.filter((s) => s.isWorking);
  const slotHeightPx = (SLOT_HEIGHT * 30) / (frameMin || 30); // Scale slot height based on frameMin

  // Calculate grid parameters
  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const totalSlots = timeSlots.length;
  const totalHeight = totalSlots * slotHeightPx;

  // Map appointments by staff
  const appointmentsByStaff = useMemo(() => {
    const map = new Map<number, CalendarAppointment[]>();
    for (const appt of appointments) {
      const list = map.get(appt.staffId) || [];
      list.push(appt);
      map.set(appt.staffId, list);
    }
    return map;
  }, [appointments]);

  // Now line position
  const nowLineTop = useMemo(() => {
    if (nowMinutes === null) return null;
    const offsetMin = nowMinutes - startHour / 1; // startHour is already in minutes
    if (offsetMin < 0 || offsetMin > totalSlots * frameMin) return null;
    return (offsetMin / frameMin) * slotHeightPx;
  }, [nowMinutes, startHour, totalSlots, frameMin, slotHeightPx]);

  if (workingStaffs.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-12 text-center text-muted-foreground">
        本日の出勤スタッフがいません
      </div>
    );
  }

  const gridCols = workingStaffs.length;

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {/* Sticky header */}
        <div
          className="sticky top-0 z-20 flex border-b bg-white/95 backdrop-blur-sm"
          style={{ minWidth: TIME_COL_WIDTH + gridCols * STAFF_COL_WIDTH }}
        >
          {/* Corner: 時間 */}
          <div
            className="flex shrink-0 items-center justify-center border-r text-xs font-medium text-gray-400"
            style={{ width: TIME_COL_WIDTH }}
          >
            時間
          </div>
          {/* Staff headers */}
          {workingStaffs.map((staff) => (
            <div
              key={staff.id}
              className="flex shrink-0 flex-col items-center justify-center border-r py-3"
              style={{ width: STAFF_COL_WIDTH }}
            >
              <div className="text-sm font-bold text-gray-900">{staff.name}</div>
              {staff.shiftStart && staff.shiftEnd && (
                <div className="text-[11px] text-gray-400">
                  {staff.shiftStart.slice(0, 5)}-{staff.shiftEnd.slice(0, 5)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div
          className="relative flex"
          style={{
            minWidth: TIME_COL_WIDTH + gridCols * STAFF_COL_WIDTH,
            height: totalHeight,
          }}
        >
          {/* Time column */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r bg-white"
            style={{ width: TIME_COL_WIDTH }}
          >
            {timeSlots.map((slot, idx) => {
              const isHour = slot.endsWith(":00");
              const isHalf = slot.endsWith(":30");
              if (!isHour && !isHalf && frameMin < 30) return null;
              return (
                <div
                  key={slot}
                  className="absolute right-0 flex items-start justify-end pr-3"
                  style={{
                    top: idx * slotHeightPx - 8,
                    height: slotHeightPx,
                  }}
                >
                  {isHour && (
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-sm">
                      {slot}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Staff columns */}
          {workingStaffs.map((staff, colIdx) => {
            const staffAppts = appointmentsByStaff.get(staff.id) || [];
            const shiftStartMin = staff.shiftStart
              ? timeToMinutes(staff.shiftStart.slice(0, 5))
              : null;
            const shiftEndMin = staff.shiftEnd
              ? timeToMinutes(staff.shiftEnd.slice(0, 5))
              : null;

            return (
              <div
                key={staff.id}
                className="relative shrink-0 border-r"
                style={{ width: STAFF_COL_WIDTH }}
              >
                {/* Grid lines */}
                {timeSlots.map((slot, idx) => {
                  const isHour = slot.endsWith(":00");
                  const slotMin = timeToMinutes(slot);
                  const isInShift =
                    shiftStartMin !== null &&
                    shiftEndMin !== null &&
                    slotMin >= shiftStartMin &&
                    slotMin < shiftEndMin;

                  return (
                    <div
                      key={slot}
                      className={`absolute w-full border-b ${
                        isHour
                          ? "border-gray-200"
                          : "border-gray-100"
                      } ${!isInShift ? "bg-gray-50/60" : "cursor-pointer hover:bg-blue-50/40"}`}
                      style={{
                        top: idx * slotHeightPx,
                        height: slotHeightPx,
                      }}
                      onClick={
                        isInShift
                          ? () => {
                              window.location.href = `/reservation/register?staffId=${staff.id}&date=${date}&time=${slot}`;
                            }
                          : undefined
                      }
                    />
                  );
                })}

                {/* Appointment blocks */}
                {staffAppts.map((appt) => {
                  const apptStartMin = timeToMinutes(appt.startAt.slice(11, 16));
                  const apptEndMin = timeToMinutes(appt.endAt.slice(11, 16));
                  const offsetSlots = (apptStartMin - startHour) / frameMin;
                  const durationSlots = (apptEndMin - apptStartMin) / frameMin;
                  const top = offsetSlots * slotHeightPx + 4;
                  const height = durationSlots * slotHeightPx - 8;

                  // Color based on new/existing + status
                  const isPast = appt.status === 2;
                  const isCancelled = appt.status === 3 || appt.status === 99;
                  let bgColor = "bg-blue-50 border-blue-200";
                  let textColor = "text-blue-900";

                  if (appt.isNewCustomer) {
                    bgColor = "bg-emerald-50 border-emerald-200";
                    textColor = "text-emerald-900";
                  }
                  if (isPast) {
                    bgColor = "bg-gray-50 border-gray-200";
                    textColor = "text-gray-500";
                  }
                  if (isCancelled) {
                    bgColor = "bg-red-50 border-red-200";
                    textColor = "text-red-400 line-through";
                  }

                  const startTime = appt.startAt.slice(11, 16);
                  const endTime = appt.endAt.slice(11, 16);

                  return (
                    <div
                      key={appt.id}
                      className={`absolute left-1 right-1 cursor-pointer rounded-2xl border ${bgColor} px-3 py-2 shadow-sm transition-shadow hover:shadow-md`}
                      style={{ top, height, zIndex: 5 }}
                      onClick={() => setSelectedAppt(appt)}
                    >
                      {/* New/Existing badge */}
                      {appt.isNewCustomer && (
                        <div className="mb-0.5 flex items-center gap-1">
                          <span className="inline-block rounded-full bg-emerald-500 px-1.5 py-0 text-[9px] font-bold text-white">
                            新規
                          </span>
                          {appt.source && (
                            <span className="text-[9px] text-emerald-600">
                              {appt.source}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Title: customer name */}
                      <div className={`text-[13px] font-black leading-tight ${textColor}`}>
                        {isPast ? "過去予約" : appt.customerName}
                      </div>

                      {/* Time range */}
                      <div className={`text-[11px] font-medium ${isPast ? "text-gray-400" : "text-gray-500"}`}>
                        {startTime}-{endTime}
                      </div>

                      {/* Menu name */}
                      <div className={`text-[11px] ${isPast ? "text-gray-400" : "text-blue-600"}`}>
                        {appt.menuName}
                        {appt.duration > 0 && ` (${appt.duration}分)`}
                      </div>

                      {/* Memo */}
                      {appt.memo && durationSlots > 2 && (
                        <div className="mt-0.5 truncate text-[10px] text-gray-400">
                          {appt.memo}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Current time red line */}
          {nowLineTop !== null && nowLineTop > 0 && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-30"
              style={{ top: nowLineTop }}
            >
              <div className="relative flex items-center">
                <div
                  className="absolute h-[10px] w-[10px] rounded-full bg-red-500"
                  style={{ left: TIME_COL_WIDTH - 5 }}
                />
                <div
                  className="absolute h-[2px] bg-red-400/75"
                  style={{ left: TIME_COL_WIDTH, right: 0 }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Appointment Detail Sheet */}
      {selectedAppt && (
        <AppointmentDetailSheet
          appointment={selectedAppt}
          open={!!selectedAppt}
          onClose={() => setSelectedAppt(null)}
        />
      )}
    </>
  );
}
