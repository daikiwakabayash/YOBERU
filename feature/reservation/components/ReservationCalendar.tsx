"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { CalendarData, CalendarAppointment } from "../types";
import { timeToMinutes, minutesToTime } from "@/helper/utils/time";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { updateAppointment } from "../actions/reservationActions";
import { toast } from "sonner";

interface ReservationCalendarProps {
  data: CalendarData;
  date: string;
  menus?: Array<{ menu_manage_id: string; name: string; price: number; duration: number }>;
  visitSources?: Array<{ id: number; name: string }>;
  paymentMethods?: Array<{ code: string; name: string }>;
  shopId?: number;
  brandId?: number;
  enableMeetingBooking?: boolean;
}

// Calendar density — shrunk per user request so the day view fits more
// staff + more hours without scrolling.
//   SLOT_HEIGHT: base height of a 30-min slot block (previously 44)
//   TIME_COL_WIDTH: narrower 時間軸 column (previously 76)
//   STAFF_COL_WIDTH: narrower staff column (previously 260)
const SLOT_HEIGHT = 34;
const TIME_COL_WIDTH = 52;
const STAFF_COL_WIDTH = 210;

/**
 * Strip leading zeros from a customer code so "00000012" renders as
 * "12" on the calendar. Falls back to the raw string (or null) so we
 * never crash on non-numeric legacy codes.
 */
function formatCustomerCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.replace(/^0+/, "");
  return trimmed.length > 0 ? trimmed : "0";
}

export function ReservationCalendar({
  data,
  date,
  menus = [],
  visitSources = [],
  paymentMethods = [],
  shopId = 1,
  brandId = 1,
  enableMeetingBooking = true,
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

  // Grid calculations (needed by drag handlers, so declare early).
  //
  // Display rule: any staff who has either a shift today OR an existing
  // appointment today must show up as a column. Otherwise their
  // appointments would be silently dropped, and the user would see a
  // blank calendar plus a "予約が既に入っています" error when trying to
  // re-book the same slot.
  const staffHasAppt = useMemo(() => {
    const ids = new Set<number>();
    for (const a of appointments) ids.add(a.staffId);
    return ids;
  }, [appointments]);
  const workingStaffs = staffs.filter(
    (s) => s.isWorking || staffHasAppt.has(s.id)
  );
  const slotHeightPx = (SLOT_HEIGHT * 30) / (frameMin || 30);
  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const totalSlots = timeSlots.length;
  const totalHeight = totalSlots * slotHeightPx;

  // Drag state
  const [dragAppt, setDragAppt] = useState<CalendarAppointment | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStaffId, setDragStaffId] = useState<number | null>(null);
  const [dragTop, setDragTop] = useState(0);
  const [isDraggingReal, setIsDraggingReal] = useState(false);
  const hasMovedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (appt: CalendarAppointment, e: React.MouseEvent) => {
      // IMPORTANT: DO NOT call e.preventDefault() here. mousedown is
      // synthesized from the initial touchstart on touch devices, and
      // preventing default there cancels the browser's scroll-gesture
      // decision for the whole touch sequence — that's the "1回目スク
      // ロールできない" bug. Text selection is suppressed via the
      // `select-none` class on the card itself.
      e.stopPropagation();
      // Cancelled appointments are read-only on the calendar — no drag,
      // just open the detail sheet so staff can see the reason / history.
      if (appt.status === 3 || appt.status === 4 || appt.status === 99) {
        setSelectedAppt(appt);
        return;
      }
      const rect = (e.target as HTMLElement).closest("[data-appt]")?.getBoundingClientRect();
      if (!rect) return;
      hasMovedRef.current = false;
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      setDragAppt(appt);
      setDragStaffId(appt.staffId);
      setDragOffset(e.clientY - rect.top);
      setDragTop(rect.top - (gridRef.current?.getBoundingClientRect().top ?? 0));
    },
    []
  );

  useEffect(() => {
    if (!dragAppt || !gridRef.current) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    const DRAG_THRESHOLD = 5; // pixels

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

      // Detect staff column
      const staffHeaders = gridRef.current!.querySelectorAll("[data-staff-id]");
      staffHeaders.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          setDragStaffId(Number(el.getAttribute("data-staff-id")));
        }
      });
    }

    async function handleMouseUp() {
      if (!dragAppt) return;

      // If mouse didn't move significantly, treat as a click: open detail sheet
      if (!hasMovedRef.current) {
        setSelectedAppt(dragAppt);
        setDragAppt(null);
        setDragStaffId(null);
        setIsDraggingReal(false);
        return;
      }

      const pixelsPerMinute = slotHeightPx / frameMin;
      const newMinutes = Math.round(dragTop / pixelsPerMinute / frameMin) * frameMin + startHour;
      const newStartTime = minutesToTime(newMinutes);
      const durationMin = timeToMinutes(dragAppt.endAt.slice(11, 16)) - timeToMinutes(dragAppt.startAt.slice(11, 16));
      const newEndTime = minutesToTime(newMinutes + durationMin);

      const newStartAt = `${date}T${newStartTime}:00`;
      const newEndAt = `${date}T${newEndTime}:00`;

      const form = new FormData();
      form.set("start_at", newStartAt);
      form.set("end_at", newEndAt);
      if (dragStaffId && dragStaffId !== dragAppt.staffId) {
        form.set("staff_id", String(dragStaffId));
      }

      const result = await updateAppointment(dragAppt.id, form);
      if ("error" in result && result.error) {
        toast.error(String(result.error));
      } else {
        toast.success(`予約を ${newStartTime} に移動しました`);
      }

      setDragAppt(null);
      setDragStaffId(null);
      setIsDraggingReal(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragAppt, dragOffset, dragTop, dragStaffId, date, frameMin, slotHeightPx, startHour]);

  useEffect(() => {
    function updateNow() {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }
    updateNow();
    const interval = setInterval(updateNow, 60000);
    return () => clearInterval(interval);
  }, []);

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
          style={{
            minWidth: TIME_COL_WIDTH + gridCols * STAFF_COL_WIDTH,
            willChange: "transform",
          }}
        >
          <div
            className="flex shrink-0 items-center justify-center border-r text-xs font-medium text-gray-400"
            style={{ width: TIME_COL_WIDTH }}
          >
            時間
          </div>
          {workingStaffs.map((staff) => {
            const isOffShift = !staff.isWorking;
            const ratePct =
              staff.utilizationRate != null
                ? Math.round(staff.utilizationRate * 100)
                : null;
            // Color the badge by load: red ≥85%, amber ≥60%, green <60%
            const rateClass =
              ratePct == null
                ? "bg-gray-100 text-gray-400"
                : ratePct >= 85
                  ? "bg-red-100 text-red-700"
                  : ratePct >= 60
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700";
            return (
              <div
                key={staff.id}
                className={`flex shrink-0 flex-col items-center justify-center border-r py-2 ${
                  isOffShift ? "bg-gray-100" : ""
                }`}
                style={{ width: STAFF_COL_WIDTH }}
              >
                {/* Staff avatar circle */}
                <div
                  className={`mb-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                    isOffShift ? "opacity-60" : ""
                  }`}
                  style={{
                    backgroundColor: staff.shiftColor || "#6366f1",
                  }}
                >
                  {staff.name.slice(0, 1)}
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className={`text-xs font-bold ${
                      isOffShift ? "text-gray-500" : "text-gray-900"
                    }`}
                  >
                    {staff.name}
                  </div>
                  {/* Today's utilization badge — empty for off-shift staff */}
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] font-bold ${rateClass}`}
                    title={`本日の稼働率 — 開放 ${staff.openMin}分 / 稼働 ${staff.busyMin}分`}
                  >
                    {ratePct != null ? `${ratePct}%` : "—"}
                  </span>
                </div>
                {staff.shiftStart && staff.shiftEnd ? (
                  <div className="text-[10px] text-gray-400">
                    {staff.shiftStart.slice(0, 5)}-
                    {staff.shiftEnd.slice(0, 5)}
                  </div>
                ) : (
                  <div className="text-[9px] font-bold text-amber-600">
                    シフト外
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div
          ref={gridRef}
          className="relative flex border-t-2 border-gray-400"
          style={{
            minWidth: TIME_COL_WIDTH + gridCols * STAFF_COL_WIDTH,
            height: totalHeight,
          }}
        >
          {/* Time column */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r bg-white"
            style={{ width: TIME_COL_WIDTH, willChange: "transform" }}
          >
            {timeSlots.map((slot, idx) => {
              const isHour = slot.endsWith(":00");
              if (!isHour) return null;
              return (
                <div
                  key={slot}
                  className="absolute right-0 flex items-start justify-end pr-3"
                  // The label sits *below* its hour line. The previous
                  // value of -8 made the very first label (9:00) clip
                  // above the grid container — by anchoring to +6 every
                  // label is fully visible inside its slot.
                  style={{ top: idx * slotHeightPx + 4 }}
                >
                  <span className="text-[11px] font-semibold text-gray-500">
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

            // Pre-compute "occupied" minutes for this staff so we can
            // disable the new-booking click on slots that already have
            // an active appointment. Cancelled (status 3/4/99) are NOT
            // considered occupied — that slot can be re-used.
            const occupiedRanges: Array<[number, number]> = [];
            for (const a of staffAppts) {
              if (a.status === 3 || a.status === 4 || a.status === 99) continue;
              occupiedRanges.push([
                timeToMinutes(a.startAt.slice(11, 16)),
                timeToMinutes(a.endAt.slice(11, 16)),
              ]);
            }
            const isMinuteOccupied = (m: number) =>
              occupiedRanges.some(([s, e]) => m >= s && m < e);

            return (
              <div
                key={staff.id}
                data-staff-id={staff.id}
                className="relative shrink-0 border-r"
                style={{ width: STAFF_COL_WIDTH }}
              >
                {/* Grid lines + clickable cells.
                    The very first row's top edge is drawn by the grid
                    container's `border-t-2` so 9:00 has a clearly
                    visible horizontal line. */}
                {timeSlots.map((slot, idx) => {
                  const slotMin = timeToMinutes(slot);
                  // Google Calendar style: the line drawn at the BOTTOM
                  // of this slot belongs to the next slot's start. If
                  // that next slot starts on a whole hour, draw a thick
                  // dark line (hour separator). Otherwise a thin light
                  // line (half-hour / quarter-hour separator).
                  const bottomMin = slotMin + frameMin;
                  const isBottomHour = bottomMin % 60 === 0;
                  const isInShift =
                    shiftStartMin !== null &&
                    shiftEndMin !== null &&
                    slotMin >= shiftStartMin &&
                    slotMin < shiftEndMin;
                  const isOccupied = isMinuteOccupied(slotMin);
                  const isClickable = isInShift && !isOccupied;

                  return (
                    <div
                      key={slot}
                      className={`absolute w-full ${
                        isBottomHour
                          ? "border-b-2 border-gray-300"
                          : "border-b border-gray-100"
                      } ${
                        !isInShift
                          ? "bg-gray-100"
                          : isOccupied
                            ? "bg-gray-50"
                            : "cursor-pointer hover:bg-blue-50/30"
                      }`}
                      style={{ top: idx * slotHeightPx, height: slotHeightPx }}
                      onClick={
                        isClickable
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

                {/* Appointment blocks
                    Layout strategy:
                      - Cancelled (status 3 / 4 / 99) render as a narrow
                        strip pinned to the right edge so the slot still
                        shows "this person had a booking here" without
                        eating the whole row.
                      - Active appointments that overlap a cancelled one
                        get their right edge pulled in to leave room for
                        the strip (like Google Calendar side-by-side).
                      - Active overlap with active is unchanged for now —
                        existing double-booking still overlaps. */}
                {(() => {
                  const isCancelledStatus = (s: number) =>
                    s === 3 || s === 4 || s === 99;
                  const cancelledRanges = staffAppts
                    .filter((a) => isCancelledStatus(a.status))
                    .map((a) => ({
                      startMin: timeToMinutes(a.startAt.slice(11, 16)),
                      endMin: timeToMinutes(a.endAt.slice(11, 16)),
                    }));
                  const overlapsCancelled = (apptStartMin: number, apptEndMin: number) =>
                    cancelledRanges.some(
                      (c) => c.startMin < apptEndMin && c.endMin > apptStartMin
                    );
                  return staffAppts.map((appt) => {
                  const apptStartMin = timeToMinutes(appt.startAt.slice(11, 16));
                  const apptEndMin = timeToMinutes(appt.endAt.slice(11, 16));
                  // Use minute-based positioning for pixel-perfect alignment
                  const minutesFromStart = apptStartMin - startHour;
                  const durationMinutes = apptEndMin - apptStartMin;
                  const pixelsPerMinute = slotHeightPx / frameMin;
                  const top = minutesFromStart * pixelsPerMinute + 2;
                  const height = durationMinutes * pixelsPerMinute - 4;

                  // Slot block (ミーティング / その他 / 休憩 / user-defined).
                  // Rendered with the master palette color and the block's
                  // label/memo instead of the system-placeholder customer.
                  const isSlotBlock = !!appt.slotBlock;

                  // Colors based on customer type + status.
                  // visit_count = 1 means "this is the customer's first
                  // actual visit" per the schema comment in 00002.
                  const isNew =
                    !isSlotBlock &&
                    (appt.isNewCustomer || appt.visitCount === 1);
                  const isPast = appt.status === 2;
                  const isInProgress = appt.status === 1;
                  const isCancelled = appt.status === 3 || appt.status === 99;
                  const isSameDayCancelled = appt.status === 4;
                  const isAnyCancelled = isCancelled || isSameDayCancelled;

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
                  } else if (isSameDayCancelled) {
                    statusBadge = "当日キャンセル";
                    statusBadgeColor = "bg-red-100 text-red-700";
                    borderColor = "border-red-300";
                    bgColor = "bg-red-50/40";
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

                  const isBeingDragged = isDraggingReal && dragAppt?.id === appt.id;

                  // ---------------- Cancelled: narrow right strip ----------------
                  // Rendered as a real <button> with onClick so taps on
                  // tablets/iPads reliably open the sheet. onMouseDown
                  // was unreliable because it runs before click, and
                  // browser hit-testing on a narrow strip over an active
                  // card sometimes routed clicks back to the parent
                  // grid. A button + onClick is the idiomatic fix.
                  if (isAnyCancelled) {
                    return (
                      <button
                        key={appt.id}
                        type="button"
                        data-appt={appt.id}
                        className={`absolute overflow-hidden rounded-md border-2 text-left ${borderColor} ${bgColor} px-1.5 py-1 transition-shadow hover:shadow-md cursor-pointer`}
                        style={{
                          top,
                          height,
                          right: 6,
                          width: "32%",
                          zIndex: 20,
                          // Same rationale as the active card: let touch
                          // pan scroll the page instead of being trapped
                          // by the button's hit-test on the first swipe.
                          touchAction: "pan-y",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAppt(appt);
                        }}
                        onMouseDown={(e) => {
                          // Belt-and-suspenders: some browsers need us
                          // to claim the mousedown so a drag handler on
                          // a parent doesn't swallow the click.
                          e.stopPropagation();
                        }}
                        title={`${appt.customerName} (${isSameDayCancelled ? "当日キャンセル" : "キャンセル"}) - タップで詳細`}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${statusBadgeColor}`}
                          >
                            {isSameDayCancelled ? "当日" : "キャンセル"}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10px] font-bold text-gray-700 line-through">
                          {appt.customerName}
                          {formatCustomerCode(appt.customerCode) && (
                            <span className="ml-1 font-normal text-gray-500">
                              ({formatCustomerCode(appt.customerCode)})
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-gray-500 line-through">
                          {appt.menuName}
                        </div>
                      </button>
                    );
                  }

                  // ---------------- Slot block (meeting / other / break) ----------------
                  // Fills the full column width like an active card but
                  // uses the master palette color for its left border +
                  // tinted background, and shows "ミーティング" / "その他"
                  // / "休憩" as the primary label with the memo or
                  // other_label as the secondary text. Clicking still
                  // routes to the AppointmentDetailSheet — the sheet
                  // itself detects slotBlock and switches to the editor.
                  if (isSlotBlock && appt.slotBlock) {
                    const sb = appt.slotBlock;
                    const blockColor = sb.color ?? "#9333ea";
                    const blockLabel = sb.label;
                    // For "その他" the memorable text lives in other_label
                    // (free-form title). For "ミーティング" / "休憩" we
                    // fall back to memo / customer_record which is the
                    // note the user typed in the meeting form.
                    const subText =
                      sb.code === "other"
                        ? appt.otherLabel || appt.customerRecord || ""
                        : appt.memo || appt.customerRecord || "";
                    return (
                      <div
                        key={appt.id}
                        data-appt={appt.id}
                        className="absolute select-none cursor-pointer overflow-hidden rounded-md border-l-4 bg-white px-2 py-1 shadow-sm transition-shadow hover:shadow-md"
                        style={{
                          top: isBeingDragged ? dragTop : top,
                          height,
                          left: 6,
                          right: 6,
                          zIndex: isBeingDragged ? 50 : 5,
                          borderLeftColor: blockColor,
                          backgroundColor: `${blockColor}12`,
                          touchAction: "pan-y",
                        }}
                        onMouseDown={(e) => handleDragStart(appt, e)}
                      >
                        <div className="flex items-center gap-1 leading-tight">
                          <span
                            className="rounded px-1.5 py-0 text-[10px] font-bold"
                            style={{
                              backgroundColor: blockColor,
                              color: sb.labelTextColor ?? "#ffffff",
                            }}
                          >
                            {blockLabel}
                          </span>
                        </div>
                        {subText && (
                          <div className="mt-0.5 truncate text-[11px] text-gray-700">
                            {subText}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ---------------- Active appointment ----------------
                  // If this active row overlaps a cancelled strip on the
                  // right, narrow its right edge so they don't visually
                  // collide.
                  const narrowForCancelled = overlapsCancelled(
                    apptStartMin,
                    apptEndMin
                  );

                  return (
                    <div
                      key={appt.id}
                      data-appt={appt.id}
                      className={`absolute select-none overflow-hidden rounded-md border ${borderColor} ${bgColor} px-1.5 py-0.5 transition-shadow hover:shadow-md ${
                        isBeingDragged
                          ? "cursor-grabbing opacity-60 z-50"
                          : "cursor-grab"
                      }`}
                      style={{
                        top: isBeingDragged ? dragTop : top,
                        height,
                        left: 6,
                        right: narrowForCancelled ? "36%" : 6,
                        zIndex: isBeingDragged ? 50 : 5,
                        // Critical for touch / trackpad: tell the browser
                        // that vertical pan wins over any drag intent on
                        // this card. Without this, the first swipe over
                        // an appointment was consumed by hit-testing /
                        // drag-decision and didn't scroll the page —
                        // exactly the "1回目スクロールできない" bug.
                        // Desktop mouse drag is unaffected because
                        // touch-action only applies to touch + scroll.
                        touchAction: "pan-y",
                      }}
                      onMouseDown={(e) => handleDragStart(appt, e)}
                    >
                      {/* Single-line header: name + code + badge + status.
                          Everything on one row with truncate so 30-min
                          slots don't overflow their box. */}
                      <div className="flex items-center gap-1 truncate leading-snug">
                        <span className="truncate text-[11px] font-black text-gray-900">
                          {appt.customerName}
                        </span>
                        {formatCustomerCode(appt.customerCode) && (
                          <span className="shrink-0 text-[9px] font-bold text-gray-500">
                            ({formatCustomerCode(appt.customerCode)})
                          </span>
                        )}
                        {isNew ? (
                          <span
                            className="shrink-0 rounded px-1 py-0 text-[9px] font-bold"
                            style={{
                              backgroundColor: appt.sourceColor ?? "#ef4444",
                              color: appt.sourceTextColor ?? "#ffffff",
                            }}
                          >
                            {appt.source ? `${appt.source}新規` : "新規"}
                          </span>
                        ) : (
                          visitLabel && (
                            <span className="shrink-0 rounded bg-blue-500 px-1 py-0 text-[9px] font-bold text-white">
                              {visitLabel}
                            </span>
                          )
                        )}
                        {statusBadge && (
                          <span
                            className={`shrink-0 rounded px-1 py-0 text-[9px] font-bold ${statusBadgeColor}`}
                          >
                            {statusBadge}
                          </span>
                        )}
                      </div>

                      {/* Menu + duration — second line, auto-hidden when
                          the card is too short (30-min slots). */}
                      <div className="truncate text-[10px] text-gray-600">
                        {appt.menuName}
                        {appt.duration > 0 && `（${appt.duration}分）`}
                      </div>
                    </div>
                  );
                  });
                })()}
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

      {/* Booking / Detail Sheet — key forces remount on selection change
          so initial form state is re-derived from the new appointment. */}
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
