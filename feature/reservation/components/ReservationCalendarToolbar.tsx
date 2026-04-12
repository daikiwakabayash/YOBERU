"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import { getWeekdayLabel } from "@/helper/utils/weekday";
import { toLocalDateString } from "@/helper/utils/time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReservationCalendarToolbarProps {
  currentDate: string;
  viewMode?: "day" | "week";
  staffs?: Array<{ id: number; name: string }>;
  selectedStaffId?: number | null;
  /**
   * Number of customer appointments (type=0) still in 待機 status
   * (status=0) for the current date. When > 0 the 集計実行 button
   * is blocked with a warning. Slot blocks (type!=0) are excluded
   * from this count — they don't need to be "completed".
   */
  pendingCount?: number;
}

export function ReservationCalendarToolbar({
  currentDate,
  viewMode = "day",
  staffs = [],
  selectedStaffId = null,
  pendingCount = 0,
}: ReservationCalendarToolbarProps) {
  const router = useRouter();
  const dateObj = new Date(currentDate + "T00:00:00");
  const weekday = getWeekdayLabel(dateObj);

  const displayDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekday})`;

  function buildUrl(params: { date?: string; view?: string; staff?: string | number | null }) {
    const searchParams = new URLSearchParams();
    const date = params.date ?? currentDate;
    searchParams.set("date", date);
    const view = params.view ?? viewMode;
    if (view === "week") searchParams.set("view", "week");
    const staff = params.staff !== undefined ? params.staff : selectedStaffId;
    if (staff) searchParams.set("staff", String(staff));
    return `/reservation?${searchParams.toString()}`;
  }

  function navigateDay(offset: number) {
    const newDate = new Date(currentDate + "T00:00:00");
    newDate.setDate(newDate.getDate() + offset);
    router.push(buildUrl({ date: toLocalDateString(newDate) }));
  }

  function navigateWeek(offset: number) {
    const newDate = new Date(currentDate + "T00:00:00");
    newDate.setDate(newDate.getDate() + offset * 7);
    router.push(buildUrl({ date: toLocalDateString(newDate) }));
  }

  function goToday() {
    router.push(buildUrl({ date: toLocalDateString(new Date()) }));
  }

  function switchView(view: "day" | "week") {
    router.push(buildUrl({ view }));
  }

  function changeStaff(staffId: string | null) {
    if (staffId) router.push(buildUrl({ staff: staffId }));
  }

  const [aggregateOpen, setAggregateOpen] = useState(false);

  function confirmAggregate() {
    setAggregateOpen(false);
    router.push(`/sales?start=${currentDate}&end=${currentDate}`);
  }

  return (
    <div className="flex items-center gap-2">
      {/* Aggregate button with confirmation dialog */}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setAggregateOpen(true)}
      >
        <BarChart3 className="h-4 w-4" />
        集計実行
      </Button>
      <Dialog open={aggregateOpen} onOpenChange={setAggregateOpen}>
        <DialogContent className="sm:max-w-md">
          {pendingCount > 0 ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600">
                  集計を実行できません
                </DialogTitle>
                <DialogDescription className="space-y-2">
                  <p>
                    {displayDate} にはまだ処理が完了していない予約が{" "}
                    <span className="font-bold text-red-600">
                      {pendingCount}件
                    </span>{" "}
                    あります。
                  </p>
                  <p>
                    すべての予約に対して「会計確定」または「予約の取り消し」
                    「当日キャンセル」のいずれかの処理を行ってから、
                    集計を実行してください。
                  </p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setAggregateOpen(false)}>
                  予約表に戻る
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>集計を実行しますか？</DialogTitle>
                <DialogDescription>
                  {displayDate}{" "}
                  の売上・予約件数・スタッフ別実績を集計して、売上ダッシュボードに表示します。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAggregateOpen(false)}
                >
                  キャンセル
                </Button>
                <Button onClick={confirmAggregate}>集計する</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Navigation */}
      {viewMode === "day" ? (
        <>
          <Button variant="outline" size="sm" onClick={() => navigateDay(-1)}>
            <ChevronLeft className="h-4 w-4" />
            前日
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            今日
          </Button>
          <span className="min-w-[200px] text-center font-medium">
            {displayDate}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigateDay(1)}>
            翌日
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
            前週
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            今日
          </Button>
          <span className="min-w-[200px] text-center font-medium">
            {displayDate}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>
            次週
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* Day/Week toggle */}
      <div className="flex rounded-md border">
        <button
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === "day"
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } rounded-l-md`}
          onClick={() => switchView("day")}
        >
          日
        </button>
        <button
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === "week"
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } rounded-r-md border-l`}
          onClick={() => switchView("week")}
        >
          週
        </button>
      </div>

      {/* Staff selector (week view only).
          Base UI's <Select.Value> falls back to the raw value string
          unless Select.Root is given an `items` map — without it the
          trigger was showing "1" / "2" instead of the staff name. */}
      {viewMode === "week" && staffs.length > 0 && (
        <StaffSelect
          staffs={staffs}
          value={selectedStaffId}
          onChange={changeStaff}
        />
      )}
    </div>
  );
}

/**
 * Staff select wrapper that supplies Base UI's required `items` map so
 * <SelectValue> can render the staff *name* in the trigger rather than
 * the raw id string. See components/layout/ShopSelector.tsx for the
 * same pattern (this is a known Base UI quirk).
 */
function StaffSelect({
  staffs,
  value,
  onChange,
}: {
  staffs: Array<{ id: number; name: string }>;
  value: number | null;
  onChange: (value: string | null) => void;
}) {
  const itemsMap = useMemo(
    () => Object.fromEntries(staffs.map((s) => [String(s.id), s.name])),
    [staffs]
  );
  return (
    <Select
      value={value ? String(value) : undefined}
      items={itemsMap}
      onValueChange={onChange}
    >
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder="スタッフ選択" />
      </SelectTrigger>
      <SelectContent>
        {staffs.map((s) => (
          <SelectItem key={s.id} value={String(s.id)}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
