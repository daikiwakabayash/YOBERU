"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toLocalDateString } from "@/helper/utils/time";

interface Props {
  /** YYYY-MM-DD */
  currentDate: string;
  viewMode: "day" | "week";
  selectedStaffId?: number | null;
  children: ReactNode;
}

const SWIPE_THRESHOLD_PX = 60;
const VERTICAL_TOLERANCE_PX = 40;

/**
 * モバイルで「左右スワイプ」を検知して前日 / 翌日 (週表示なら前週 / 翌週)
 * へ遷移するラッパー。
 *
 * - touchstart で起点を記録、touchend で X / Y の差分を見て横方向の
 *   移動量が閾値を超え、かつ縦方向のずれが小さければ navigate。
 * - 子要素の縦スクロール (時間表) はそのまま使えるよう、touchAction は
 *   "pan-y" に固定。横スクロールは内部の予約表が担当する場合があるが、
 *   そちらは「指を離した時の累計移動距離」で判定するので競合しない。
 *
 * デスクトップでは何も起きないので影響なし。
 */
export function SwipeNavigator({
  currentDate,
  viewMode,
  selectedStaffId,
  children,
}: Props) {
  const router = useRouter();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  function buildUrl(newDate: string) {
    const sp = new URLSearchParams();
    sp.set("date", newDate);
    if (viewMode === "week") sp.set("view", "week");
    if (selectedStaffId) sp.set("staff", String(selectedStaffId));
    return `/reservation?${sp.toString()}`;
  }

  function navigate(offset: number) {
    const d = new Date(currentDate + "T00:00:00");
    if (viewMode === "week") d.setDate(d.getDate() + offset * 7);
    else d.setDate(d.getDate() + offset);
    router.push(buildUrl(toLocalDateString(d)));
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    startX.current = null;
    startY.current = null;
    if (Math.abs(dy) > VERTICAL_TOLERANCE_PX) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    // 左スワイプ (dx < 0) → 翌日 / 翌週
    // 右スワイプ (dx > 0) → 前日 / 前週
    navigate(dx < 0 ? 1 : -1);
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="touch-pan-y"
    >
      {children}
    </div>
  );
}
