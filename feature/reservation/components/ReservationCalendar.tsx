"use client";

import { useMemo, useState, useEffect } from "react";
import type { CalendarData, CalendarAppointment } from "../types";
import { timeToMinutes } from "@/helper/utils/time";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";

interface ReservationCalendarProps {
  data: CalendarData;
  date: string;
  menus?: Array<{ menu_manage_id: string; name: string; price: number; duration: number }>;
  visitSources?: Array<{ id: number; name: string }>;
  shopId?: number;
  brandId?: number;
}

const SLOT_HEIGHT = 44;
const TIME_COL_WIDTH = 76;
const STAFF_COL_WIDTH = 260;

export function ReservationCalendar({
  data,
  date,
  menus = [],
  visitSources = [],
  shopId = 1,
  brandId = 1,
}: ReservationCalendarProps) {
  const { staffs, appointments, timeSlots, frameMin } = data;
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [newBooking, setNewBooking] = useState<{
    staffId: number;
    staffName: string;
    date: string;
    time: string;
  } | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

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
  const slotHeightPx = (SLOT_HEIGHT * 30) / (frameMin || 30);
  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const totalSlots = timeSlots.length;
  const totalHeight = totalSlots * slotHeightPx;

  const appointmentsByStaff = useMemo(() => {
    const map = new Map<number, CalendarAppointment[]>();
    for (const appt of appointments) {
      const list = map.get(appt.staffId) || [];
      list.push(appt);
      map.set(appt.staffId, list);
    }
    return map;
  }, [appointments]);

  const nowLineTop = useMemo(() => {
    if (nowMinutes === null) return null;
    const offsetMin = nowMinutes - startHour;
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
  const sheetOpen = !!selectedAppt || !!newBooking;

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {/* Sticky header */}
        <div
          className="sticky top-0 z-20 flex border-b bg-white/95 backdrop-blur-sm"
          style={{ minWidth: TIME_COL_WIDTH + gridCols * STAFF_COL_WIDTH }}
        >
          <div
            className="flex shrink-0 items-center justify-center border-r text-xs font-medium text-gray-400"
            style={{ width: TIME_COL_WIDTH }}
          >
            時間
          </div>
          {workingStaffs.map((staff) => (
            <div
              key={staff.id}
              className="flex shrink-0 flex-col items-center justify-center border-r py-3"
              style={{ width: STAFF_COL_WIDTH }}
            >
              {/* Staff avatar circle */}
              <div
                className="mb-1 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: staff.shiftColor || "#6366f1" }}
              >
                {staff.name.slice(0, 1)}
              </div>
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
              if (!isHour) return null;
              return (
                <div
                  key={slot}
                  className="absolute right-0 flex items-start justify-end pr-3"
                  style={{ top: idx * slotHeightPx - 8 }}
                >
                  <span className="text-[13px] font-semibold text-gray-500">
                    {slot}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Staff columns */}
          {workingStaffs.map((staff) => {
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
                {/* Grid lines + clickable cells */}
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
                        isHour ? "border-gray-200" : "border-gray-100/60"
                      } ${!isInShift ? "bg-gray-50/60" : "cursor-pointer hover:bg-blue-50/30"}`}
                      style={{ top: idx * slotHeightPx, height: slotHeightPx }}
                      onClick={
                        isInShift
                          ? () =>
                              setNewBooking({
                                staffId: staff.id,
                                staffName: staff.name,
                                date,
                                time: slot,
                              })
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
                  const top = offsetSlots * slotHeightPx + 3;
                  const height = durationSlots * slotHeightPx - 6;
                  const startTime = appt.startAt.slice(11, 16);
                  const endTime = appt.endAt.slice(11, 16);

                  // Colors based on customer type + status
                  const isNew = appt.isNewCustomer || appt.visitCount <= 1;
                  const isPast = appt.status === 2;
                  const isInProgress = appt.status === 1;
                  const isCancelled = appt.status === 3 || appt.status === 99;

                  let borderColor = "border-blue-300";
                  let bgColor = "bg-white";
                  let statusBadge = "";
                  let statusBadgeColor = "";

                  if (isNew) {
                    borderColor = "border-orange-300";
                    bgColor = "bg-orange-50/50";
                  }
                  if (isPast) {
                    statusBadge = "完了";
                    statusBadgeColor = "bg-gray-100 text-gray-500";
                    bgColor = "bg-gray-50";
                    borderColor = "border-gray-200";
                  } else if (isInProgress) {
                    statusBadge = "施術中";
                    statusBadgeColor = "bg-green-100 text-green-700";
                    borderColor = "border-green-400";
                  } else if (isCancelled) {
                    statusBadge = "キャンセル";
                    statusBadgeColor = "bg-red-100 text-red-600";
                    borderColor = "border-red-200";
                    bgColor = "bg-red-50/30";
                  } else if (appt.status === 0) {
                    statusBadge = "待機";
                    statusBadgeColor = "bg-orange-100 text-orange-700";
                  }

                  // Visit count badge
                  const visitLabel = isNew
                    ? null
                    : appt.visitCount > 0
                      ? `${appt.visitCount}回目`
                      : null;

                  return (
                    <div
                      key={appt.id}
                      className={`absolute left-1.5 right-1.5 cursor-pointer rounded-lg border-2 ${borderColor} ${bgColor} px-3 py-2 transition-shadow hover:shadow-lg`}
                      style={{ top, height, zIndex: 5 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAppt(appt);
                      }}
                    >
                      {/* Status badge top-right */}
                      {statusBadge && (
                        <div className="absolute right-1.5 top-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadgeColor}`}
                          >
                            {statusBadge}
                          </span>
                        </div>
                      )}

                      {/* Customer name + visit badge */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-black text-gray-900 leading-tight">
                          {appt.customerName}
                        </span>
                        {isNew ? (
                          <span className="rounded bg-red-500 px-1.5 py-0 text-[10px] font-bold text-white">
                            {appt.source ? `${appt.source}新規` : "新規"}
                          </span>
                        ) : (
                          visitLabel && (
                            <span className="rounded bg-blue-500 px-1.5 py-0 text-[10px] font-bold text-white">
                              {visitLabel}
                            </span>
                          )
                        )}
                      </div>

                      {/* Menu + duration */}
                      <div className="mt-0.5 text-[12px] text-gray-600">
                        {appt.menuName}
                        {appt.duration > 0 && `（${appt.duration}分）`}
                      </div>

                      {/* Source for new customers */}
                      {isNew && appt.source && (
                        <div className="text-[11px] text-gray-400">
                          {appt.source}
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
              <div
                className="absolute h-[10px] w-[10px] rounded-full bg-red-500"
                style={{ left: TIME_COL_WIDTH - 5 }}
              />
              <div
                className="absolute h-[2px] bg-red-400/75"
                style={{ left: TIME_COL_WIDTH, right: 0 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Booking / Detail Sheet */}
      <AppointmentDetailSheet
        open={sheetOpen}
        onClose={() => {
          setSelectedAppt(null);
          setNewBooking(null);
        }}
        appointment={selectedAppt}
        newBooking={newBooking}
        menus={menus}
        visitSources={visitSources}
        shopId={shopId}
        brandId={brandId}
      />
    </>
  );
}
