"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { bulkInsertBreaks } from "../actions/bulkBreakActions";
import { WEEKDAY_LABELS_JP } from "@/helper/utils/weekday";

interface BulkBreakDialogProps {
  open: boolean;
  onClose: () => void;
  brandId: number;
  shopId: number;
  staffs: Array<{ id: number; name: string }>;
  /** 表示中の週頭 (YYYY-MM-DD)。日付レンジの初期値に使う。 */
  defaultStartDate: string;
}

// 15 分刻みで 00:00 〜 23:45 の時刻候補を生成する。
const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      opts.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
    }
  }
  return opts;
})();

// 月曜始まりで月〜日を描画する (日本の曜日感覚に合わせる)。
const WEEKDAY_BUTTONS: Array<{ value: number; label: string }> = [
  { value: 1, label: WEEKDAY_LABELS_JP[1] },
  { value: 2, label: WEEKDAY_LABELS_JP[2] },
  { value: 3, label: WEEKDAY_LABELS_JP[3] },
  { value: 4, label: WEEKDAY_LABELS_JP[4] },
  { value: 5, label: WEEKDAY_LABELS_JP[5] },
  { value: 6, label: WEEKDAY_LABELS_JP[6] },
  { value: 0, label: WEEKDAY_LABELS_JP[0] },
];

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BulkBreakDialog({
  open,
  onClose,
  brandId,
  shopId,
  staffs,
  defaultStartDate,
}: BulkBreakDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(addDays(defaultStartDate, 27));
  const [selectedStaffIds, setSelectedStaffIds] = useState<number[]>([]);
  // 全曜日選択をデフォルトにする。
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([
    1, 2, 3, 4, 5, 6, 0,
  ]);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("14:00");
  const [skipNonWorkingDays, setSkipNonWorkingDays] = useState(true);

  const allStaffSelected = useMemo(
    () =>
      staffs.length > 0 &&
      staffs.every((s) => selectedStaffIds.includes(s.id)),
    [staffs, selectedStaffIds]
  );

  function toggleStaff(id: number) {
    setSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAllStaff() {
    if (allStaffSelected) {
      setSelectedStaffIds([]);
    } else {
      setSelectedStaffIds(staffs.map((s) => s.id));
    }
  }

  function toggleWeekday(w: number) {
    setSelectedWeekdays((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  }

  async function handleSubmit() {
    if (selectedStaffIds.length === 0) {
      toast.error("対象スタッフを1名以上選択してください");
      return;
    }
    if (selectedWeekdays.length === 0) {
      toast.error("対象曜日を1つ以上選択してください");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("期間を入力してください");
      return;
    }
    if (startDate > endDate) {
      toast.error("開始日は終了日以前にしてください");
      return;
    }
    if (startTime >= endTime) {
      toast.error("開始時刻は終了時刻より前にしてください");
      return;
    }

    setSaving(true);
    try {
      const res = await bulkInsertBreaks({
        brandId,
        shopId,
        staffIds: selectedStaffIds,
        startDate,
        endDate,
        weekdays: selectedWeekdays,
        startTime,
        endTime,
        skipNonWorkingDays,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const parts = [`${res.inserted} 件の休憩を登録しました`];
      if (res.skippedNonWorking > 0) {
        parts.push(`出勤なし ${res.skippedNonWorking} 件スキップ`);
      }
      if (res.skippedDuplicate > 0) {
        parts.push(`重複 ${res.skippedDuplicate} 件スキップ`);
      }
      toast.success(parts.join(" / "));
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>休憩の一括登録</DialogTitle>
          <DialogDescription>
            期間・スタッフ・曜日を指定して、休憩時間を一気に反映します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 期間 */}
          <section className="space-y-2">
            <Label className="text-xs font-bold text-gray-700">期間</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-gray-500">〜</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1"
              />
            </div>
          </section>

          {/* スタッフ */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-gray-700">
                対象スタッフ
              </Label>
              <button
                type="button"
                onClick={toggleAllStaff}
                className="text-[11px] text-blue-600 hover:underline"
              >
                {allStaffSelected ? "全解除" : "全選択"}
              </button>
            </div>
            {staffs.length === 0 ? (
              <p className="text-xs text-gray-400">
                スタッフが登録されていません
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                {staffs.map((s) => {
                  const checked = selectedStaffIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStaff(s.id)}
                      />
                      <span>{s.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* 曜日 */}
          <section className="space-y-2">
            <Label className="text-xs font-bold text-gray-700">対象曜日</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_BUTTONS.map(({ value, label }) => {
                const on = selectedWeekdays.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleWeekday(value)}
                    className={`h-9 w-9 rounded-md border text-sm font-bold transition-colors ${
                      on
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 休憩時間 */}
          <section className="space-y-2">
            <Label className="text-xs font-bold text-gray-700">休憩時間</Label>
            <div className="flex items-center gap-2">
              <Select
                value={startTime}
                onValueChange={(v) => v && setStartTime(v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-gray-500">〜</span>
              <Select
                value={endTime}
                onValueChange={(v) => v && setEndTime(v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* オプション */}
          <section>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={skipNonWorkingDays}
                onCheckedChange={(v) => setSkipNonWorkingDays(!!v)}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold text-gray-900">
                  出勤日のみに適用
                </span>
                <span className="ml-2 text-[11px] text-gray-500">
                  休日 / シフト未設定日はスキップ
                </span>
              </span>
            </label>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "登録中..." : "一括登録"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
