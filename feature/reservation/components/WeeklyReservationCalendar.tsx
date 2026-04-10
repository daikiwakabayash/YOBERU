"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { CalendarAppointment } from "../types";
import type { WeeklyCalendarData } from "../services/getWeeklyCalendarData";
import { timeToMinutes, minutesToTime, toLocalDateString } from "@/helper/utils/time";
import { WEEKDAY_LABELS_JP } from "@/helper/utils/weekday";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { updateAppointment } from "../actions/reservationActions";
import { toast } from "sonner";

interface WeeklyReservationCalendarProps {
  data: WeeklyCalendarData;
  menus?: Array<{ menu_manage_id: string; name: string; price: number; duration: number }>;
  visitSources?: Array<{ id: number; name: string }>;
  shopId?: number;
  brandId?: number;
  staffId?: number | null;
}

const SLOT_HEIGHT = 44;
const TIME_COL_WIDTH = 76;
const DAY_COL_MIN_WIDTH = 180;

export function WeeklyReservationCalendar({
  data,
  menus = [],
  visitSources = [],
  shopId = 1,
  brandId = 1,
  staffId,
}: WeeklyReservationCalendarProps) {
  const { appointments, timeSlots, frameMin, weekDates } = data;
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [newBooking, setNewBooking] = useState<{
    staffId: number;
    staffName: string;
    date: string;
    time: string;
  } | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  // Grid calculations
  const slotHeightPx = (SLOT_HEIGHT * 30) / (frameMin || 30);
  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const totalSlots = timeSlots.length;
  const totalHeight = totalSlots * slotHeightPx;
  const today = toLocalDateString(new Date());

  // Drag state
  const [dragAppt, setDragAppt] = useState<CalendarAppointment | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragTop, setDragTop] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (appt: CalendarAppointment, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.target as HTMLElement).closest("[data-appt]")?.getBoundingClientRect();
      if (!rect) return;
      // Determine the date of this appointment from its startAt
      const apptDate = appt.startAt.slice(0, 10);
      setDragAppt(appt);
      setDragDate(apptDate);
      setDragOffset(e.clientY - rect.top);
      setDragTop(rect.top - (gridRef.current?.getBoundingClientRect().top ?? 0));
    },
    []
  );

  useEffect(() => {
    if (!dragAppt || !gridRef.current) return;
    const gridRect = gridRef.current.getBoundingClientRect();

    function handleMouseMove(e: MouseEvent) {
      const newTop = e.clientY - gridRect.top - dragOffset;
      setDragTop(Math.max(0, newTop));

      // Detect which day column the cursor is over
      const dayCols = gridRef.current!.querySelectorAll("[data-date]");
      dayCols.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          setDragDate(el.getAttribute("data-date"));
        }
      });
    }

    async function handleMouseUp() {
      if (!dragAppt || !dragDate) return;
      const pixelsPerMinute = slotHeightPx / frameMin;
      const newMinutes = Math.round(dragTop / pixelsPerMinute / frameMin) * frameMin + startHour;
      const newStartTime = minutesToTime(newMinutes);
      const durationMin = timeToMinutes(dragAppt.endAt.slice(11, 16)) - timeToMinutes(dragAppt.startAt.slice(11, 16));
      const newEndTime = minutesToTime(newMinutes + durationMin);

      const newStartAt = `${dragDate}T${newStartTime}:00`;
      const newEndAt = `${dragDate}T${newEndTime}:00`;

      const form = new FormData();
      form.set("start_at", newStartAt);
      form.set("end_at", newEndAt);

      const result = await updateAppointment(dragAppt.id, form);
      if ("error" in result && result.error) {
        toast.error(String(result.error));
      } else {
        const dateLabel = `${Number(dragDate.split("-")[1])}/${Number(dragDate.split("-")[2])}`;
        toast.success(`予約を ${dateLabel} ${newStartTime} に移動しました`);
      }

      setDragAppt(null);
      setDragDate(null);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragAppt, dragOffset, dragTop, dragDate, frameMin, slotHeightPx, startHour]);

  // Current time tracker
  useEffect(() => {
    function updateNow() {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }
    updateNow();
    const interval = setInterval(updateNow, 60000);
    return () => clearInterval(interval);
  }, []);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const appt of appointments) {
      const dateKey = appt.startAt.slice(0, 10);
      const list = map.get(dateKey) || [];
      list.push(appt);
      map.set(dateKey, list);
    }
    return map;
  }, [appointments]);

  const nowLineTop = useMemo(() => {
    if (nowMinutes === null) return null;
    const offsetMin = nowMinutes - startHour;
    if (offsetMin < 0 || offsetMin > totalSlots * frameMin) return null;
    return (offsetMin / frameMin) * slotHeightPx;
  }, [nowMinutes, startHour, totalSlots, frameMin, slotHeightPx]);

  if (weekDates.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-12 text-center text-muted-foreground">
        週データを取得できませんでした
      </div>
    );
  }

  const gridCols = weekDates.length; // 7
  const sheetOpen = !!selectedAppt || !!newBooking;

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {/* Sticky header - day columns */}
        <div
          className="sticky top-0 z-20 flex border-b bg-white/95 backdrop-blur-sm"
          style={{ minWidth: TIME_COL_WIDTH + gridCols * DAY_COL_MIN_WIDTH }}
        >
          <div
            className="flex shrink-0 items-center justify-center border-r text-xs font-medium text-gray-400"
            style={{ width: TIME_COL_WIDTH }}
          >
            時間
          </div>
          {weekDates.map((dateStr) => {
            const d = new Date(dateStr + "T00:00:00");
            const dayLabel = WEEKDAY_LABELS_JP[d.getDay()];
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const isToday = dateStr === today;
            const isSunday = d.getDay() === 0;
            const isSaturday = d.getDay() === 6;

            return (
              <div
                key={dateStr}
                className={`flex shrink-0 flex-col items-center justify-center border-r py-3 ${
                  isToday ? "bg-blue-50" : ""
                }`}
                style={{ width: DAY_COL_MIN_WIDTH, flex: 1 }}
              >
                <div
                  className={`text-sm font-medium ${
                    isToday
                      ? "text-blue-600"
                      : isSunday
                        ? "text-red-500"
                        : isSaturday
                          ? "text-blue-500"
                          : "text-gray-500"
                  }`}
                >
                  {dayLabel}
                </div>
                <div
                  className={`text-lg font-bold ${
                    isToday
                      ? "text-blue-600"
                      : "text-gray-900"
                  }`}
                >
                  {month}/{day}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div
          ref={gridRef}
          className="relative flex"
          style={{
            minWidth: TIME_COL_WIDTH + gridCols * DAY_COL_MIN_WIDTH,
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

          {/* Day columns */}
          {weekDates.map((dateStr) => {
            const dayAppts = appointmentsByDate.get(dateStr) || [];
            const isToday = dateStr === today;

            return (
              <div
                key={dateStr}
                data-date={dateStr}
                className={`relative shrink-0 border-r ${isToday ? "bg-blue-50/30" : ""}`}
                style={{ width: DAY_COL_MIN_WIDTH, flex: 1 }}
              >
                {/* Grid lines + clickable cells */}
                {timeSlots.map((slot, idx) => {
                  const isHour = slot.endsWith(":00");
                  return (
                    <div
                      key={slot}
                      className={`absolute w-full border-b ${
                        isHour ? "border-gray-200" : "border-gray-100/60"
                      } cursor-pointer hover:bg-blue-50/30`}
                      style={{ top: idx * slotHeightPx, height: slotHeightPx }}
                      onClick={() => {
                        if (staffId) {
                          setNewBooking({
                            staffId,
                            staffName: data.staffName ?? "",
                            date: dateStr,
                            time: slot,
                          });
                        }
                      }}
                    />
                  );
                })}

                {/* Appointment blocks */}
                {dayAppts.map((appt) => {
                  const apptStartMin = timeToMinutes(appt.startAt.slice(11, 16));
                  const apptEndMin = timeToMinutes(appt.endAt.slice(11, 16));
                  const minutesFromStart = apptStartMin - startHour;
                  const durationMinutes = apptEndMin - apptStartMin;
                  const pixelsPerMinute = slotHeightPx / frameMin;
                  const top = minutesFromStart * pixelsPerMinute + 2;
                  const height = durationMinutes * pixelsPerMinute - 4;

                  const isDragging = dragAppt?.id === appt.id;

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
                    statusBadge = "会計完了";
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
                  }

                  return (
                    <div
                      key={appt.id}
                      data-appt={appt.id}
                      className={`absolute left-1.5 right-1.5 rounded-lg border-2 ${borderColor} ${bgColor} px-2 py-1.5 transition-shadow hover:shadow-lg ${
                        isDragging
                          ? "cursor-grabbing opacity-60 z-50"
                          : "cursor-grab"
                      }`}
                      style={{
                        top: isDragging ? dragTop : top,
                        height,
                        zIndex: isDragging ? 50 : 5,
                      }}
                      onClick={(e) => {
                        if (dragAppt) return;
                        e.stopPropagation();
                        setSelectedAppt(appt);
                      }}
                      onMouseDown={(e) => handleDragStart(appt, e)}
                    >
                      {/* Status badge */}
                      {statusBadge && (
                        <div className="absolute right-1 top-1">
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] font-bold ${statusBadgeColor}`}
                          >
                            {statusBadge}
                          </span>
                        </div>
                      )}

                      {/* Customer name */}
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] font-black text-gray-900 leading-tight truncate">
                          {appt.customerName}
                        </span>
                        {isNew && (
                          <span className="shrink-0 rounded bg-red-500 px-1 py-0 text-[9px] font-bold text-white">
                            新規
                          </span>
                        )}
                      </div>

                      {/* Menu + duration */}
                      <div className="mt-0.5 text-[11px] text-gray-600 truncate">
                        {appt.menuName}
                        {appt.duration > 0 && `（${appt.duration}分）`}
                      </div>
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
