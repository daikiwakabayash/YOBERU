"use client";

import { useMemo, useState } from "react";
import type { CalendarAppointment } from "../types";
import { timeToMinutes } from "@/helper/utils/time";
import { getWeekDates, getWeekdayLabel } from "@/helper/utils/weekday";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";

interface WeekViewProps {
  staffId: number;
  staffName: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  appointments: CalendarAppointment[];
  timeSlots: string[];
  frameMin: number;
  menus: Array<{ menu_manage_id: string; name: string; price: number; duration: number }>;
  visitSources: Array<{ id: number; name: string }>;
  shopId: number;
  brandId: number;
}

const SLOT_HEIGHT = 40;
const DAY_COL_WIDTH = 180;
const TIME_COL_WIDTH = 60;

export function WeekView({
  staffId,
  staffName,
  weekStart,
  appointments,
  timeSlots,
  frameMin,
  menus,
  visitSources,
  shopId,
  brandId,
}: WeekViewProps) {
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [newBooking, setNewBooking] = useState<{
    staffId: number;
    staffName: string;
    date: string;
    time: string;
  } | null>(null);

  const weekDates = useMemo(() => {
    const d = new Date(weekStart + "T00:00:00");
    return getWeekDates(d);
  }, [weekStart]);

  const slotHeightPx = (SLOT_HEIGHT * 30) / (frameMin || 30);
  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const totalHeight = timeSlots.length * slotHeightPx;

  // Group appointments by date
  const apptsByDate = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const appt of appointments) {
      const date = appt.startAt.slice(0, 10);
      const list = map.get(date) || [];
      list.push(appt);
      map.set(date, list);
    }
    return map;
  }, [appointments]);

  const sheetOpen = !!selectedAppt || !!newBooking;

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {/* Header: staff name + week dates */}
        <div className="sticky top-0 z-20 flex border-b bg-white/95 backdrop-blur-sm">
          <div
            className="flex shrink-0 items-center justify-center border-r text-xs font-medium text-gray-400"
            style={{ width: TIME_COL_WIDTH }}
          >
            時間
          </div>
          {weekDates.map((date) => {
            const dateStr = date.toISOString().split("T")[0];
            const dayLabel = getWeekdayLabel(date);
            const isToday = dateStr === new Date().toISOString().split("T")[0];
            const isSat = date.getDay() === 6;
            const isSun = date.getDay() === 0;

            return (
              <div
                key={dateStr}
                className={`flex shrink-0 flex-col items-center justify-center border-r py-2 ${
                  isToday ? "bg-blue-50" : ""
                }`}
                style={{ width: DAY_COL_WIDTH }}
              >
                <div className={`text-xs ${isSat ? "text-blue-500" : isSun ? "text-red-500" : "text-gray-400"}`}>
                  {dayLabel}
                </div>
                <div className={`text-sm font-bold ${isToday ? "text-blue-600" : ""}`}>
                  {date.getMonth() + 1}/{date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div
          className="relative flex"
          style={{
            minWidth: TIME_COL_WIDTH + 7 * DAY_COL_WIDTH,
            height: totalHeight,
          }}
        >
          {/* Time column */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r bg-white"
            style={{ width: TIME_COL_WIDTH }}
          >
            {timeSlots.map((slot, idx) => {
              if (!slot.endsWith(":00")) return null;
              return (
                <div
                  key={slot}
                  className="absolute right-0 flex items-start justify-end pr-2"
                  style={{ top: idx * slotHeightPx - 6 }}
                >
                  <span className="text-[12px] font-medium text-gray-500">
                    {slot}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {weekDates.map((date) => {
            const dateStr = date.toISOString().split("T")[0];
            const dayAppts = apptsByDate.get(dateStr) || [];
            const isToday = dateStr === new Date().toISOString().split("T")[0];

            return (
              <div
                key={dateStr}
                className={`relative shrink-0 border-r ${isToday ? "bg-blue-50/30" : ""}`}
                style={{ width: DAY_COL_WIDTH }}
              >
                {/* Grid lines */}
                {timeSlots.map((slot, idx) => {
                  const isHour = slot.endsWith(":00");
                  return (
                    <div
                      key={slot}
                      className={`absolute w-full border-b cursor-pointer hover:bg-blue-50/40 ${
                        isHour ? "border-gray-200" : "border-gray-100/60"
                      }`}
                      style={{ top: idx * slotHeightPx, height: slotHeightPx }}
                      onClick={() =>
                        setNewBooking({
                          staffId,
                          staffName,
                          date: dateStr,
                          time: slot,
                        })
                      }
                    />
                  );
                })}

                {/* Appointment blocks */}
                {dayAppts.map((appt) => {
                  const apptStartMin = timeToMinutes(appt.startAt.slice(11, 16));
                  const apptEndMin = timeToMinutes(appt.endAt.slice(11, 16));
                  const pixelsPerMinute = slotHeightPx / frameMin;
                  const top = (apptStartMin - startHour) * pixelsPerMinute + 2;
                  const height = (apptEndMin - apptStartMin) * pixelsPerMinute - 4;

                  const isNew = appt.isNewCustomer || appt.visitCount <= 1;
                  const isCompleted = appt.status === 2;
                  let borderColor = isNew ? "border-orange-300" : "border-blue-300";
                  let bgColor = isNew ? "bg-orange-50/50" : "bg-white";
                  if (isCompleted) {
                    borderColor = "border-gray-200";
                    bgColor = "bg-gray-50";
                  }

                  return (
                    <div
                      key={appt.id}
                      className={`absolute left-1 right-1 rounded-lg border-2 ${borderColor} ${bgColor} px-2 py-1 cursor-pointer hover:shadow-md text-xs`}
                      style={{ top, height, zIndex: 5 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAppt(appt);
                      }}
                    >
                      <div className="font-bold truncate">{appt.customerName}</div>
                      <div className="text-gray-500 truncate">
                        {appt.menuName}（{appt.duration}分）
                      </div>
                      {isCompleted && (
                        <span className="text-[9px] text-gray-400">会計完了</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

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
