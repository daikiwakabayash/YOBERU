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
  paymentMethods?: Array<{ code: string; name: string }>;
  shopId?: number;
  brandId?: number;
  staffId?: number | null;
  enableMeetingBooking?: boolean;
}

const SLOT_HEIGHT = 34;
const TIME_COL_WIDTH = 52;
const DAY_COL_MIN_WIDTH = 150;

/**
 * Strip leading zeros from a customer code so "00000012" renders as
 * "12". See ReservationCalendar for rationale.
 */
function formatCustomerCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.replace(/^0+/, "");
  return trimmed.length > 0 ? trimmed : "0";
}

export function WeeklyReservationCalendar({
  data,
  menus = [],
  visitSources = [],
  paymentMethods = [],
  shopId = 1,
  brandId = 1,
  staffId,
  enableMeetingBooking = true,
}: WeeklyReservationCalendarProps) {
  const {
    appointments,
    timeSlots,
    frameMin,
    weekDates,
    staffName,
    staffUtilizationRate,
    staffOpenMin,
    staffBusyMin,
    dailyUtilization,
  } = data;
  // Map date → daily util row for O(1) lookup in the header render.
  const dailyUtilByDate = useMemo(() => {
    const m = new Map<string, (typeof dailyUtilization)[number]>();
    for (const d of dailyUtilization) m.set(d.date, d);
    return m;
  }, [dailyUtilization]);
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
  const [isDraggingReal, setIsDraggingReal] = useState(false);
  const hasMovedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (appt: CalendarAppointment, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.target as HTMLElement).closest("[data-appt]")?.getBoundingClientRect();
      if (!rect) return;
      // Determine the date of this appointment from its startAt
      const apptDate = appt.startAt.slice(0, 10);
      hasMovedRef.current = false;
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
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
    const DRAG_THRESHOLD = 5;

    function handleMouseMove(e: MouseEvent) {
      const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
      const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
      if (!hasMovedRef.current && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        hasMovedRef.current = true;
        setIsDraggingReal(true);
      }
      if (!hasMovedRef.current) return;

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

      // Click (no movement): open detail sheet
      if (!hasMovedRef.current) {
        setSelectedAppt(dragAppt);
        setDragAppt(null);
        setDragDate(null);
        setIsDraggingReal(false);
        return;
      }

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
      setIsDraggingReal(false);
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

  // Color the utilization badge by load: red ≥85%, amber ≥60%,
  // green <60% — same palette as the day view staff column header.
  const ratePct =
    staffUtilizationRate != null
      ? Math.round(staffUtilizationRate * 100)
      : null;
  const rateClass =
    ratePct == null
      ? "bg-gray-100 text-gray-400"
      : ratePct >= 85
        ? "bg-red-100 text-red-700"
        : ratePct >= 60
          ? "bg-amber-100 text-amber-700"
          : "bg-emerald-100 text-emerald-700";

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {/* Staff banner — shows the currently filtered staff + their
            weekly utilization rate. Only rendered when a staff is
            selected (week view is always staff-filtered). */}
        {staffName && (
          <div className="flex items-center gap-3 border-b bg-gray-50/80 px-4 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">
              {staffName.slice(0, 1)}
            </div>
            <div className="text-sm font-bold text-gray-900">{staffName}</div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-bold ${rateClass}`}
              title={`週間稼働率 — 開放 ${staffOpenMin}分 / 稼働 ${staffBusyMin}分`}
            >
              稼働率 {ratePct != null ? `${ratePct}%` : "—"}
            </span>
            <span className="text-[10px] text-gray-400">
              開放 {staffOpenMin}分 / 稼働 {staffBusyMin}分
            </span>
          </div>
        )}

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
                {/* Per-day utilization badge — same palette as the
                    weekly banner (85%↑=red, 60%↑=amber, <60%=green,
                    no shift → grey "—"). Only rendered when a staff
                    is selected so the week header has util data. */}
                {(() => {
                  const du = dailyUtilByDate.get(dateStr);
                  if (!du) return null;
                  const pct =
                    du.rate != null ? Math.round(du.rate * 100) : null;
                  const cls =
                    pct == null
                      ? "bg-gray-100 text-gray-400"
                      : pct >= 85
                        ? "bg-red-100 text-red-700"
                        : pct >= 60
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700";
                  return (
                    <span
                      className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
                      title={`${dateStr} 稼働率 — 開放 ${du.openMin}分 / 稼働 ${du.busyMin}分`}
                    >
                      {pct != null ? `${pct}%` : "—"}
                    </span>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Grid body — border-t-2 draws the top line of the first
            slot so the earliest hour (e.g. 9:00) has a visible line,
            matching the day view exactly. */}
        <div
          ref={gridRef}
          className="relative flex border-t-2 border-gray-400"
          style={{
            minWidth: TIME_COL_WIDTH + gridCols * DAY_COL_MIN_WIDTH,
            height: totalHeight,
          }}
        >
          {/* Time column — labels sit JUST BELOW each hour line, same
              rule as the day view (top = idx * slotHeightPx + 4). The
              previous -8 offset made labels float above their hour,
              leaving 11:00 lined up with the 10:30 area. */}
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
                  className="absolute right-0 flex items-start justify-end pr-2"
                  style={{ top: idx * slotHeightPx + 4 }}
                >
                  <span className="text-[11px] font-semibold text-gray-500">
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
                {/* Grid lines + clickable cells — same Google-Calendar
                    style as the day view: the horizontal line drawn at
                    the BOTTOM of this slot belongs to the next slot's
                    start, and if that start sits on a whole hour we
                    draw a thick dark separator. */}
                {timeSlots.map((slot, idx) => {
                  const slotMin = timeToMinutes(slot);
                  const bottomMin = slotMin + frameMin;
                  const isBottomHour = bottomMin % 60 === 0;
                  return (
                    <div
                      key={slot}
                      className={`absolute w-full ${
                        isBottomHour
                          ? "border-b-2 border-gray-300"
                          : "border-b border-gray-100"
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

                  const isDragging = isDraggingReal && dragAppt?.id === appt.id;

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

                      {/* Customer name + カルテNo */}
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] font-black text-gray-900 leading-tight truncate">
                          {appt.customerName}
                        </span>
                        {formatCustomerCode(appt.customerCode) && (
                          <span className="shrink-0 text-[9px] font-bold text-gray-500">
                            ({formatCustomerCode(appt.customerCode)})
                          </span>
                        )}
                        {isNew && (
                          <span
                            className="shrink-0 rounded px-1 py-0 text-[9px] font-bold"
                            style={{
                              backgroundColor: appt.sourceColor ?? "#ef4444",
                              color: appt.sourceTextColor ?? "#ffffff",
                            }}
                          >
                            {appt.source ? `${appt.source}新規` : "新規"}
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

      {/* Booking / Detail Sheet — key forces remount on selection change */}
      <AppointmentDetailSheet
        key={
          selectedAppt
            ? `appt-${selectedAppt.id}`
            : newBooking
              ? `new-${newBooking.date}-${newBooking.time}-${newBooking.staffId}`
              : "closed"
        }
        open={sheetOpen}
        onClose={() => {
          setSelectedAppt(null);
          setNewBooking(null);
        }}
        appointment={selectedAppt}
        newBooking={newBooking}
        menus={menus}
        visitSources={visitSources}
        paymentMethods={paymentMethods}
        shopId={shopId}
        brandId={brandId}
        enableMeetingBooking={enableMeetingBooking}
      />
    </>
  );
}
