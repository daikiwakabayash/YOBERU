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
  menus?: Array<{ menu_manage_id: string; name: string; price: number; duration: number; plan_type?: string | null }>;
  visitSources?: Array<{ id: number; name: string }>;
  paymentMethods?: Array<{ code: string; name: string }>;
  shopId?: number;
  brandId?: number;
  staffId?: number | null;
  enableMeetingBooking?: boolean;
}

// Horizontal layout constants — day rows on Y, time on X.
// 幅を詰めて横スクロール量を小さくする:
//   PX_PER_MIN: 1分あたりの横幅 (以前は4。2.2にして約45%圧縮)
//     → 30min = 66px, 60min = 132px, 12h = 1584px
const DAY_ROW_HEIGHT = 72;
const DAY_LABEL_WIDTH = 100;
const TIME_HEADER_HEIGHT = 32;
const PX_PER_MIN = 2.2;

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

  const startHour = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : 540;
  const endMinute =
    timeSlots.length > 0
      ? timeToMinutes(timeSlots[timeSlots.length - 1]) + frameMin
      : 1260;
  const totalMinutes = endMinute - startHour;
  const totalWidth = totalMinutes * PX_PER_MIN;
  const today = toLocalDateString(new Date());

  // Drag state — horizontal drag changes time, vertical changes day.
  // Live drag values live in refs (no re-render) and only the ghost's
  // visual position is mirrored to state, throttled by requestAnimation
  // Frame. This avoids the mousemove → setState → effect cleanup cycle
  // that previously made dragging feel laggy.
  const [dragAppt, setDragAppt] = useState<CalendarAppointment | null>(null);
  const [dragLeft, setDragLeft] = useState(0);
  const [isDraggingReal, setIsDraggingReal] = useState(false);
  const dragOffsetRef = useRef(0);
  const dragDateRef = useRef<string | null>(null);
  const dragLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (appt: CalendarAppointment, e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement)
        .closest("[data-appt]")
        ?.getBoundingClientRect();
      if (!rect) return;
      const apptDate = appt.startAt.slice(0, 10);
      // タイムライン領域の左端 (曜日名列 DAY_LABEL_WIDTH を除いた
      // 位置) を基準にする。
      const timelineOriginX =
        (gridRef.current?.getBoundingClientRect().left ?? 0) +
        DAY_LABEL_WIDTH;
      hasMovedRef.current = false;
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      dragOffsetRef.current = e.clientX - rect.left;
      dragDateRef.current = apptDate;
      const initialLeft = rect.left - timelineOriginX;
      dragLeftRef.current = initialLeft;
      setDragLeft(initialLeft);
      setDragAppt(appt);
    },
    []
  );

  useEffect(() => {
    if (!dragAppt || !gridRef.current) return;
    const gridEl = gridRef.current;
    const DRAG_THRESHOLD = 5;
    const dayRowEls = Array.from(
      gridEl.querySelectorAll<HTMLElement>("[data-date]")
    );

    function handleMouseMove(e: MouseEvent) {
      if (!hasMovedRef.current) {
        const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
        const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          hasMovedRef.current = true;
          setIsDraggingReal(true);
        } else {
          return;
        }
      }

      const gridRect = gridEl.getBoundingClientRect();
      const timelineOriginX = gridRect.left + DAY_LABEL_WIDTH;
      const rawLeft = e.clientX - timelineOriginX - dragOffsetRef.current;
      const newLeft = Math.max(0, Math.min(rawLeft, totalWidth));
      dragLeftRef.current = newLeft;

      for (const el of dayRowEls) {
        const r = el.getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          dragDateRef.current = el.getAttribute("data-date");
          break;
        }
      }

      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setDragLeft(dragLeftRef.current);
        });
      }
    }

    async function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (!hasMovedRef.current) {
        setSelectedAppt(dragAppt);
        setDragAppt(null);
        setIsDraggingReal(false);
        return;
      }

      const dropDate = dragDateRef.current;
      if (!dropDate) {
        setDragAppt(null);
        setIsDraggingReal(false);
        return;
      }

      const finalLeft = dragLeftRef.current;
      const newMinutes =
        Math.round(finalLeft / PX_PER_MIN / frameMin) * frameMin + startHour;
      const newStartTime = minutesToTime(newMinutes);
      const durationMin =
        timeToMinutes(dragAppt!.endAt.slice(11, 16)) -
        timeToMinutes(dragAppt!.startAt.slice(11, 16));
      const newEndTime = minutesToTime(newMinutes + durationMin);

      const newStartAt = `${dropDate}T${newStartTime}:00`;
      const newEndAt = `${dropDate}T${newEndTime}:00`;

      const form = new FormData();
      form.set("start_at", newStartAt);
      form.set("end_at", newEndAt);

      const result = await updateAppointment(dragAppt!.id, form);
      if ("error" in result && result.error) {
        toast.error(String(result.error));
      } else {
        const dateLabel = `${Number(dropDate.split("-")[1])}/${Number(dropDate.split("-")[2])}`;
        toast.success(`予約を ${dateLabel} ${newStartTime} に移動しました`);
      }

      setDragAppt(null);
      setIsDraggingReal(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [dragAppt, frameMin, startHour, totalWidth]);

  useEffect(() => {
    function updateNow() {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }
    updateNow();
    const interval = setInterval(updateNow, 60000);
    return () => clearInterval(interval);
  }, []);

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

  const nowLineLeft = useMemo(() => {
    if (nowMinutes === null) return null;
    const offsetMin = nowMinutes - startHour;
    if (offsetMin < 0 || offsetMin > totalMinutes) return null;
    return offsetMin * PX_PER_MIN;
  }, [nowMinutes, startHour, totalMinutes]);

  if (weekDates.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-12 text-center text-muted-foreground">
        週データを取得できませんでした
      </div>
    );
  }

  const sheetOpen = !!selectedAppt || !!newBooking;

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

  // Compute time labels for header
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
      {/* overflow-x: auto + overflow-y: clip で縦スクロールは <main> に委譲。
          日表示側と同じ理由: overflow-y:auto にすると二重スクロールで
          日付切替時にカレンダーが潰れる症状が出るため。 */}
      <div
        className="rounded-2xl border bg-white shadow-sm"
        style={{
          overflowX: "auto",
          overflowY: "clip",
          touchAction: "pan-y",
        }}
      >
        {/* Staff banner */}
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

        {/* Time header (sticky top) */}
        <div
          className="sticky top-0 z-20 flex border-b bg-white/95 backdrop-blur-sm"
          style={{
            minWidth: DAY_LABEL_WIDTH + totalWidth,
            height: TIME_HEADER_HEIGHT,
          }}
        >
          <div
            className="sticky left-0 z-30 flex shrink-0 items-center justify-center border-r bg-white/95 text-xs font-medium text-gray-400 backdrop-blur-sm"
            style={{ width: DAY_LABEL_WIDTH }}
          >
            日付
          </div>
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
          style={{ minWidth: DAY_LABEL_WIDTH + totalWidth }}
        >
          {/* Day rows */}
          {weekDates.map((dateStr) => {
            const dayAppts = appointmentsByDate.get(dateStr) || [];
            const d = new Date(dateStr + "T00:00:00");
            const dayLabel = WEEKDAY_LABELS_JP[d.getDay()];
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const isToday = dateStr === today;
            const isSunday = d.getDay() === 0;
            const isSaturday = d.getDay() === 6;

            const du = dailyUtilByDate.get(dateStr);
            const duPct = du?.rate != null ? Math.round(du.rate * 100) : null;
            const duClass =
              duPct == null
                ? "bg-gray-100 text-gray-400"
                : duPct >= 85
                  ? "bg-red-100 text-red-700"
                  : duPct >= 60
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700";

            return (
              <div
                key={dateStr}
                data-date={dateStr}
                className="flex border-b"
                style={{ height: DAY_ROW_HEIGHT }}
              >
                {/* Day label (sticky left) */}
                <div
                  className={`sticky left-0 z-10 flex shrink-0 flex-col items-center justify-center border-r bg-white ${
                    isToday ? "bg-blue-50" : ""
                  }`}
                  style={{ width: DAY_LABEL_WIDTH }}
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
                      isToday ? "text-blue-600" : "text-gray-900"
                    }`}
                  >
                    {month}/{day}
                  </div>
                  {du && (
                    <span
                      className={`mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${duClass}`}
                      title={`${dateStr} 稼働率 — 開放 ${du.openMin}分 / 稼働 ${du.busyMin}分`}
                    >
                      {duPct != null ? `${duPct}%` : "—"}
                    </span>
                  )}
                </div>

                {/* Timeline area */}
                <div
                  className={`relative ${isToday ? "bg-blue-50/30" : ""}`}
                  style={{ width: totalWidth, height: DAY_ROW_HEIGHT }}
                >
                  {/* Grid lines (vertical) + clickable cells */}
                  {timeSlots.map((slot) => {
                    const slotMin = timeToMinutes(slot);
                    const leftPx = (slotMin - startHour) * PX_PER_MIN;
                    const widthPx = frameMin * PX_PER_MIN;
                    const isHour = slotMin % 60 === 0;
                    const isHalf = slotMin % 30 === 0 && !isHour;

                    return (
                      <div
                        key={slot}
                        className={`absolute top-0 h-full ${
                          isHour
                            ? "border-l-2 border-gray-300"
                            : isHalf
                              ? "border-l border-gray-200"
                              : "border-l border-gray-100"
                        } cursor-pointer hover:bg-blue-50/30`}
                        style={{ left: leftPx, width: widthPx }}
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
                  {(() => {
                    // 同じ日に時間が被る予約を vertical lane に分ける。
                    // (日ビューのスタッフ行と同じアルゴリズム)
                    const laneMap = new Map<number, { lane: number; laneCount: number }>();
                    const active = dayAppts
                      .slice()
                      .sort((a, b) =>
                        a.startAt.localeCompare(b.startAt) ||
                        a.endAt.localeCompare(b.endAt)
                      );
                    let cluster: typeof active = [];
                    let clusterEnd = -1;
                    const flush = () => {
                      if (cluster.length === 0) return;
                      const laneEnds: number[] = [];
                      const perAppt: Array<{ id: number; lane: number }> = [];
                      for (const a of cluster) {
                        const s = timeToMinutes(a.startAt.slice(11, 16));
                        const e = timeToMinutes(a.endAt.slice(11, 16));
                        let lane = laneEnds.findIndex((end) => end <= s);
                        if (lane === -1) {
                          lane = laneEnds.length;
                          laneEnds.push(e);
                        } else {
                          laneEnds[lane] = e;
                        }
                        perAppt.push({ id: a.id, lane });
                      }
                      const laneCount = laneEnds.length;
                      for (const p of perAppt) {
                        laneMap.set(p.id, { lane: p.lane, laneCount });
                      }
                      cluster = [];
                      clusterEnd = -1;
                    };
                    for (const a of active) {
                      const s = timeToMinutes(a.startAt.slice(11, 16));
                      const e = timeToMinutes(a.endAt.slice(11, 16));
                      if (cluster.length === 0 || s < clusterEnd) {
                        cluster.push(a);
                        clusterEnd = Math.max(clusterEnd, e);
                      } else {
                        flush();
                        cluster.push(a);
                        clusterEnd = e;
                      }
                    }
                    flush();

                    return dayAppts.map((appt) => {
                    const apptStartMin = timeToMinutes(appt.startAt.slice(11, 16));
                    const apptEndMin = timeToMinutes(appt.endAt.slice(11, 16));
                    const minutesFromStart = apptStartMin - startHour;
                    const durationMinutes = apptEndMin - apptStartMin;
                    const apptLeft = minutesFromStart * PX_PER_MIN + 1;
                    const apptWidth = durationMinutes * PX_PER_MIN - 2;
                    const laneInfo = laneMap.get(appt.id) ?? {
                      lane: 0,
                      laneCount: 1,
                    };
                    const availableHeight = DAY_ROW_HEIGHT - 6;
                    const laneHeight = availableHeight / laneInfo.laneCount;
                    const laneTop = 3 + laneInfo.lane * laneHeight;
                    const laneBottom =
                      3 + (laneInfo.laneCount - 1 - laneInfo.lane) * laneHeight;

                    const isDragging = isDraggingReal && dragAppt?.id === appt.id;
                    const isSlotBlock = !!appt.slotBlock;

                    if (isSlotBlock && appt.slotBlock) {
                      const sb = appt.slotBlock;
                      const blockColor = sb.color ?? "#9333ea";
                      // 「その他」も memo を主に表示する。
                      // 旧データの otherLabel はフォールバック扱い。
                      const subText =
                        appt.memo ||
                        (sb.code === "other" ? appt.otherLabel : "") ||
                        appt.customerRecord ||
                        "";
                      return (
                        <div
                          key={appt.id}
                          data-appt={appt.id}
                          className="absolute cursor-pointer select-none overflow-hidden rounded-md border-l-4 bg-white px-2 py-1 shadow-sm transition-shadow hover:shadow-md"
                          style={{
                            left: isDragging ? dragLeft : apptLeft,
                            width: apptWidth,
                            top: laneTop,
                            bottom: laneBottom,
                            zIndex: isDragging ? 50 : 5,
                            borderLeftColor: blockColor,
                            backgroundColor: `${blockColor}12`,
                            touchAction: "pan-x",
                          }}
                          onMouseDown={(e) => handleDragStart(appt, e)}
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className="rounded px-1 py-0 text-[9px] font-bold"
                              style={{
                                backgroundColor: blockColor,
                                color: sb.labelTextColor ?? "#ffffff",
                              }}
                            >
                              {sb.label}
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

                    // カード幅が狭いケース用に、ホバー時にフル情報を読める
                    // title ツールチップを用意する。
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
                        // カスタムフローティングツールチップは隣の行のカードに
                        // 重なる問題があったため撤去。OS 標準の title 属性で
                        // フル情報を提供する。
                        title={apptTooltip || undefined}
                        className={`absolute select-none rounded-md border ${borderColor} ${bgColor} transition-shadow hover:shadow-md ${
                          isDragging
                            ? "cursor-grabbing opacity-60 z-50"
                            : "cursor-grab"
                        }`}
                        style={{
                          left: isDragging ? dragLeft : apptLeft,
                          width: apptWidth,
                          top: laneTop,
                          bottom: laneBottom,
                          zIndex: isDragging ? 50 : 5,
                          touchAction: "pan-x",
                        }}
                        onMouseDown={(e) => handleDragStart(appt, e)}
                      >
                        {/* 2 行レイアウト (日ビューと同じ形式):
                              1 行目: 顧客名 + カルテ番号
                              2 行目: 来店バッジ + ステータス + メニュー名 */}
                        <div className="overflow-hidden px-1 py-[1px]">
                          <div className="flex min-w-0 items-baseline gap-0.5 leading-none">
                            <span
                              className={`min-w-0 flex-1 truncate text-[11px] font-black ${
                                appt.customerName
                                  ? "text-gray-900"
                                  : "text-gray-400"
                              }`}
                            >
                              {appt.customerName || "未設定"}
                            </span>
                            {formatCustomerCode(appt.customerCode) && (
                              <span className="shrink-0 text-[9px] font-bold text-gray-500">
                                ({formatCustomerCode(appt.customerCode)})
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex min-w-0 items-center gap-0.5 leading-none">
                            {isNew && (
                              <span
                                className="shrink-0 rounded px-1 py-0 text-[10px] font-bold"
                                style={{
                                  backgroundColor: appt.sourceColor ?? "#ef4444",
                                  color: appt.sourceTextColor ?? "#ffffff",
                                }}
                              >
                                {appt.source ? `${appt.source}新規` : "新規"}
                              </span>
                            )}
                            {statusBadge && (
                              <span
                                className={`shrink-0 rounded px-1 py-0 text-[10px] font-bold ${statusBadgeColor}`}
                              >
                                {statusBadge}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[10px] leading-none text-gray-600">
                              {appt.menuName}
                              {appt.duration > 0 && `（${appt.duration}分）`}
                            </span>
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
                left: DAY_LABEL_WIDTH + nowLineLeft,
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
