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

// Horizontal layout constants — staff rows on Y, time on X.
// 幅を詰めて横スクロール量を小さくする:
//   STAFF_ROW_HEIGHT: スタッフ行の高さ。30 分枠 (幅 66px) でも 1 行目に
//     名前、2 行目にバッジ + メニュー名が収まるよう、コンパクトな
//     "横広がり" レイアウトを取る。縦に間延びさせない。
//   STAFF_LABEL_WIDTH: 左のスタッフ名列の幅
//   TIME_HEADER_HEIGHT: 上部の時間ヘッダーの高さ
//   PX_PER_MIN: 1分あたりの横幅 (以前は4。2.2にして約45%圧縮)
//     → 30min = 66px, 60min = 132px, 12h = 1584px
const STAFF_ROW_HEIGHT = 64;
const STAFF_LABEL_WIDTH = 120;
const TIME_HEADER_HEIGHT = 32;
const PX_PER_MIN = 2.2;

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

  // Display rule: show staff with shift OR existing appointment.
  const staffHasAppt = useMemo(() => {
    const ids = new Set<number>();
    for (const a of appointments) ids.add(a.staffId);
    return ids;
  }, [appointments]);
  const workingStaffs = staffs.filter(
    (s) => s.isWorking || staffHasAppt.has(s.id)
  );

  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const endMinute =
    timeSlots.length > 0
      ? timeToMinutes(timeSlots[timeSlots.length - 1]) + frameMin
      : 1260;
  const totalMinutes = endMinute - startHour;
  const totalWidth = totalMinutes * PX_PER_MIN;

  // Drag state — horizontal drag changes time, vertical changes staff.
  const [dragAppt, setDragAppt] = useState<CalendarAppointment | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStaffId, setDragStaffId] = useState<number | null>(null);
  const [dragLeft, setDragLeft] = useState(0);
  const [isDraggingReal, setIsDraggingReal] = useState(false);
  const hasMovedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (appt: CalendarAppointment, e: React.MouseEvent) => {
      e.stopPropagation();
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
      setDragOffset(e.clientX - rect.left);
      setDragLeft(rect.left - (gridRef.current?.getBoundingClientRect().left ?? 0));
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

      const newLeft = e.clientX - gridRect.left - dragOffset;
      setDragLeft(Math.max(0, newLeft));

      // Detect staff row by Y position
      const staffRows = gridRef.current!.querySelectorAll("[data-staff-id]");
      staffRows.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          setDragStaffId(Number(el.getAttribute("data-staff-id")));
        }
      });
    }

    async function handleMouseUp() {
      if (!dragAppt) return;

      if (!hasMovedRef.current) {
        setSelectedAppt(dragAppt);
        setDragAppt(null);
        setDragStaffId(null);
        setIsDraggingReal(false);
        return;
      }

      const newMinutes =
        Math.round(dragLeft / PX_PER_MIN / frameMin) * frameMin + startHour;
      const newStartTime = minutesToTime(newMinutes);
      const durationMin =
        timeToMinutes(dragAppt.endAt.slice(11, 16)) -
        timeToMinutes(dragAppt.startAt.slice(11, 16));
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
  }, [dragAppt, dragOffset, dragLeft, dragStaffId, date, frameMin, startHour]);

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

  const nowLineLeft = useMemo(() => {
    if (nowMinutes === null) return null;
    const offsetMin = nowMinutes - startHour;
    if (offsetMin < 0 || offsetMin > totalMinutes) return null;
    return offsetMin * PX_PER_MIN;
  }, [nowMinutes, startHour, totalMinutes]);

  if (workingStaffs.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-12 text-center text-muted-foreground">
        本日の出勤スタッフがいません
      </div>
    );
  }

  const sheetOpen = !!selectedAppt || !!newBooking;

  // Compute hour labels for the time header
  const hourLabels: { label: string; left: number }[] = [];
  for (let i = 0; i < timeSlots.length; i++) {
    const slot = timeSlots[i];
    if (slot.endsWith(":00") || slot.endsWith(":30")) {
      const min = timeToMinutes(slot);
      hourLabels.push({
        label: slot,
        left: (min - startHour) * PX_PER_MIN,
      });
    }
  }

  return (
    <>
      {/* overflow-x: auto + overflow-y: clip.
          overflow-y を "auto" にすると、 overflow-x:auto と組み合わさって
          ダッシュボード <main> のスクロールバーと二重になり、日付切替時に
          外枠の height が 0 に潰れてカレンダーが消えて見える症状が起きる。
          overflow-y:clip で縦スクロールは親の <main> に完全に委譲する。 */}
      <div
        className="rounded-2xl border bg-white shadow-sm"
        style={{
          overflowX: "auto",
          overflowY: "clip",
          touchAction: "pan-y",
        }}
      >
        {/* Time header (sticky top) */}
        <div
          className="sticky top-0 z-20 flex border-b bg-white/95 backdrop-blur-sm"
          style={{
            minWidth: STAFF_LABEL_WIDTH + totalWidth,
            height: TIME_HEADER_HEIGHT,
          }}
        >
          {/* Top-left corner */}
          <div
            className="sticky left-0 z-30 flex shrink-0 items-center justify-center border-r bg-white/95 text-xs font-medium text-gray-400 backdrop-blur-sm"
            style={{ width: STAFF_LABEL_WIDTH }}
          >
            スタッフ
          </div>
          {/* Time labels */}
          <div className="relative" style={{ width: totalWidth }}>
            {hourLabels.map(({ label, left }) => {
              const isHour = label.endsWith(":00");
              return (
                <div
                  key={label}
                  className="absolute flex items-center justify-center"
                  style={{
                    left,
                    top: 0,
                    bottom: 0,
                    width: frameMin * PX_PER_MIN,
                  }}
                >
                  <span
                    className={`text-[11px] ${
                      isHour
                        ? "font-semibold text-gray-600"
                        : "font-normal text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid body */}
        <div
          ref={gridRef}
          className="relative"
          style={{ minWidth: STAFF_LABEL_WIDTH + totalWidth }}
        >
          {/* Staff rows */}
          {workingStaffs.map((staff) => {
            const staffAppts = appointmentsByStaff.get(staff.id) || [];
            const isOffShift = !staff.isWorking;
            const shiftStartMin = staff.shiftStart
              ? timeToMinutes(staff.shiftStart.slice(0, 5))
              : null;
            const shiftEndMin = staff.shiftEnd
              ? timeToMinutes(staff.shiftEnd.slice(0, 5))
              : null;

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

            const ratePct =
              staff.utilizationRate != null
                ? Math.round(staff.utilizationRate * 100)
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
              <div
                key={staff.id}
                data-staff-id={staff.id}
                className="flex border-b"
                style={{ height: STAFF_ROW_HEIGHT }}
              >
                {/* Staff label (sticky left) */}
                <div
                  className={`sticky left-0 z-10 flex shrink-0 flex-col items-center justify-center border-r bg-white ${
                    isOffShift ? "bg-gray-50" : ""
                  }`}
                  style={{ width: STAFF_LABEL_WIDTH }}
                >
                  <div className="flex items-center gap-1">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                        isOffShift ? "opacity-60" : ""
                      }`}
                      style={{
                        backgroundColor: staff.shiftColor || "#6366f1",
                      }}
                    >
                      {staff.name.slice(0, 1)}
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        isOffShift ? "text-gray-500" : "text-gray-900"
                      }`}
                    >
                      {staff.name}
                    </span>
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-bold ${rateClass}`}
                      title={`本日の稼働率 — 開放 ${staff.openMin}分 / 稼働 ${staff.busyMin}分`}
                    >
                      {ratePct != null ? `${ratePct}%` : "—"}
                    </span>
                  </div>
                  {staff.shiftStart && staff.shiftEnd ? (
                    <div className="text-[10px] text-gray-400">
                      [{staff.shiftStart.slice(0, 5)}-{staff.shiftEnd.slice(0, 5)}]
                    </div>
                  ) : (
                    <div className="text-[9px] font-bold text-red-500">
                      休日
                    </div>
                  )}
                </div>

                {/* Timeline area */}
                <div
                  className="relative"
                  style={{ width: totalWidth, height: STAFF_ROW_HEIGHT }}
                >
                  {/* Grid lines (vertical) + clickable cells + off-shift shading */}
                  {timeSlots.map((slot) => {
                    const slotMin = timeToMinutes(slot);
                    const leftPx = (slotMin - startHour) * PX_PER_MIN;
                    const widthPx = frameMin * PX_PER_MIN;
                    const isHour = slotMin % 60 === 0;
                    const isHalf = slotMin % 30 === 0 && !isHour;
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
                        className={`absolute top-0 h-full ${
                          isHour
                            ? "border-l-2 border-gray-300"
                            : isHalf
                              ? "border-l border-gray-200"
                              : "border-l border-gray-100"
                        } ${
                          !isInShift
                            ? "bg-gray-100"
                            : isOccupied
                              ? "bg-gray-50"
                              : "cursor-pointer hover:bg-blue-50/30"
                        }`}
                        style={{ left: leftPx, width: widthPx }}
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

                  {/* Appointment blocks */}
                  {(() => {
                    const isCancelledStatus = (s: number) =>
                      s === 3 || s === 4 || s === 99;
                    const cancelledRanges = staffAppts
                      .filter((a) => isCancelledStatus(a.status))
                      .map((a) => ({
                        startMin: timeToMinutes(a.startAt.slice(11, 16)),
                        endMin: timeToMinutes(a.endAt.slice(11, 16)),
                      }));
                    const overlapsCancelled = (s: number, e: number) =>
                      cancelledRanges.some(
                        (c) => c.startMin < e && c.endMin > s
                      );

                    return staffAppts.map((appt) => {
                      const apptStartMin = timeToMinutes(appt.startAt.slice(11, 16));
                      const apptEndMin = timeToMinutes(appt.endAt.slice(11, 16));
                      const minutesFromStart = apptStartMin - startHour;
                      const durationMinutes = apptEndMin - apptStartMin;
                      const apptLeft = minutesFromStart * PX_PER_MIN + 1;
                      const apptWidth = durationMinutes * PX_PER_MIN - 2;

                      const isSlotBlock = !!appt.slotBlock;
                      // 新規判定: visitCount が 0 (submitPublicBooking は
                      // visit_count を未設定のまま INSERT するため DB
                      // デフォルト 0 になる) または 1 の場合を新規とみなす。
                      // isNewCustomer は「顧客の created_at が今日」で判定
                      // するため、前日に作成した顧客の翌日予約は false になる。
                      const isNew =
                        !isSlotBlock &&
                        (appt.isNewCustomer || appt.visitCount <= 1);
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

                      const visitLabel = isNew
                        ? null
                        : appt.visitCount > 0
                          ? `${appt.visitCount}回目`
                          : null;

                      const isBeingDragged = isDraggingReal && dragAppt?.id === appt.id;

                      // Cancelled: narrow bottom strip
                      if (isAnyCancelled) {
                        return (
                          <button
                            key={appt.id}
                            type="button"
                            data-appt={appt.id}
                            className={`absolute overflow-hidden rounded-md border text-left ${borderColor} ${bgColor} px-1 py-0.5 transition-shadow hover:shadow-md cursor-pointer`}
                            style={{
                              left: apptLeft,
                              width: apptWidth,
                              bottom: 2,
                              height: "30%",
                              zIndex: 20,
                              touchAction: "pan-x",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppt(appt);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={`${appt.customerName} (${isSameDayCancelled ? "当日キャンセル" : "キャンセル"}) - タップで詳細`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              <span
                                className={`shrink-0 rounded px-1 py-0 text-[8px] font-bold ${statusBadgeColor}`}
                              >
                                {isSameDayCancelled ? "当日" : "キャンセル"}
                              </span>
                              <span className="truncate text-[9px] font-bold text-gray-700 line-through">
                                {appt.customerName}
                              </span>
                            </div>
                          </button>
                        );
                      }

                      // Slot block (meeting / other / break)
                      if (isSlotBlock && appt.slotBlock) {
                        const sb = appt.slotBlock;
                        const blockColor = sb.color ?? "#9333ea";
                        // 「その他」も meeting / break と同様に memo
                        // (＝シートの「メモ」欄) を主にし、無ければ
                        // 旧データの otherLabel / customerRecord を
                        // フォールバックとして表示する。
                        const subText =
                          appt.memo ||
                          (sb.code === "other" ? appt.otherLabel : "") ||
                          appt.customerRecord ||
                          "";
                        return (
                          <div
                            key={appt.id}
                            data-appt={appt.id}
                            className="absolute select-none cursor-pointer overflow-hidden rounded-md border-l-4 bg-white px-2 py-1 shadow-sm transition-shadow hover:shadow-md"
                            style={{
                              left: isBeingDragged ? dragLeft : apptLeft,
                              width: apptWidth,
                              top: 3,
                              bottom: 3,
                              zIndex: isBeingDragged ? 50 : 5,
                              borderLeftColor: blockColor,
                              backgroundColor: `${blockColor}12`,
                              touchAction: "pan-x",
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
                                {sb.label}
                              </span>
                              <span className="truncate text-[10px] text-gray-600">
                                {appt.startAt.slice(11, 16)}-{appt.endAt.slice(11, 16)}
                              </span>
                            </div>
                            {subText && (
                              <div className="mt-0.5 truncate text-[10px] text-gray-700">
                                {subText}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Active appointment
                      const narrowForCancelled = overlapsCancelled(
                        apptStartMin,
                        apptEndMin
                      );

                      // 30 分枠などカード幅が狭いと顧客名が truncate されて
                      // 数文字しか見えないケースがある。せめてマウスを
                      // 乗せたとき (title ツールチップ) にフルの名前 /
                      // カルテ番号 / メニュー / 時間帯が読めるようにする。
                      const tooltipLines: string[] = [];
                      if (appt.customerName) {
                        const codeStr = formatCustomerCode(appt.customerCode);
                        tooltipLines.push(
                          codeStr
                            ? `${appt.customerName} (${codeStr})`
                            : appt.customerName
                        );
                      } else if (formatCustomerCode(appt.customerCode)) {
                        tooltipLines.push(
                          `カルテ #${formatCustomerCode(appt.customerCode)}`
                        );
                      }
                      tooltipLines.push(
                        `${appt.startAt.slice(11, 16)}-${appt.endAt.slice(11, 16)}`
                      );
                      if (appt.menuName) {
                        tooltipLines.push(
                          appt.duration > 0
                            ? `${appt.menuName}（${appt.duration}分）`
                            : appt.menuName
                        );
                      }
                      if (statusBadge) tooltipLines.push(statusBadge);
                      const apptTooltip = tooltipLines.join("\n");

                      return (
                        <div
                          key={appt.id}
                          data-appt={appt.id}
                          // ホバー時のフル情報は OS の title でのみ提供する。
                          // 自前のフローティングツールチップは隣の行のカードに
                          // 重なって読みにくかったため撤去 (カード本体が
                          // 縦積みレイアウトで十分な情報を表示する)。
                          title={apptTooltip || undefined}
                          className={`absolute select-none rounded-md border ${borderColor} ${bgColor} transition-shadow hover:shadow-md ${
                            isBeingDragged
                              ? "cursor-grabbing opacity-60 z-50"
                              : "cursor-grab"
                          }`}
                          style={{
                            left: isBeingDragged ? dragLeft : apptLeft,
                            width: apptWidth,
                            top: 3,
                            bottom: narrowForCancelled ? "34%" : 3,
                            zIndex: isBeingDragged ? 50 : 5,
                            touchAction: "pan-x",
                          }}
                          onMouseDown={(e) => handleDragStart(appt, e)}
                        >
                          {/* コンパクトな縦積みレイアウト。30 分枠 (幅 66px)
                              に収まるよう、行高を詰めてフォントサイズを
                              小さめに統一する。
                              - 1 行目: 顧客名 (text-[11px] 太字、truncate)
                              - 2 行目: バッジ + メニュー名を横並び
                                  (バッジ text-[9px], メニュー text-[10px])
                              カルテ番号やフル情報はホバー時の OS title で
                              確認できる。 */}
                          <div className="flex h-full flex-col justify-center overflow-hidden px-1 py-[1px]">
                            {/* 1 行目: 顧客名 */}
                            <div
                              className={`truncate text-[11px] font-black leading-none ${
                                appt.customerName ? "text-gray-900" : "text-gray-400"
                              }`}
                            >
                              {appt.customerName || "未設定"}
                            </div>
                            {/* 2 行目: バッジ群 + メニュー名 (横並び)。
                                バッジは shrink-0、メニュー名は flex-1 で
                                truncate して 1 行に収める。 */}
                            <div className="mt-0.5 flex min-w-0 items-center gap-0.5 leading-none">
                              {isNew ? (
                                <span
                                  className="shrink-0 truncate rounded px-1 py-0 text-[9px] font-bold"
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
                              {appt.menuName && (
                                <span className="min-w-0 flex-1 truncate text-[10px] leading-none text-gray-500">
                                  {appt.menuName}
                                  {appt.duration > 0 && `（${appt.duration}分）`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })}

          {/* Current time vertical red line */}
          {nowLineLeft !== null && nowLineLeft > 0 && (
            <div
              className="pointer-events-none absolute z-30"
              style={{
                left: STAFF_LABEL_WIDTH + nowLineLeft,
                top: 0,
                bottom: 0,
              }}
            >
              <div
                className="absolute h-[10px] w-[10px] rounded-full bg-red-500"
                style={{ top: -5, left: -5 }}
              />
              <div
                className="absolute w-[2px] bg-red-400/75"
                style={{ top: 0, bottom: 0, left: -1 }}
              />
            </div>
          )}
        </div>
      </div>

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
