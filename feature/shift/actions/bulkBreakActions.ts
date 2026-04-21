"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getEffectiveShifts } from "../services/getStaffShifts";

export interface BulkBreakInput {
  brandId: number;
  shopId: number;
  staffIds: number[];
  /** YYYY-MM-DD inclusive */
  startDate: string;
  /** YYYY-MM-DD inclusive */
  endDate: string;
  /** [0..6], 0=Sun ... 6=Sat。空配列なら全曜日対象。 */
  weekdays: number[];
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  /** true の場合、staff が その日に出勤していない (getEffectiveShifts
   *  の startTime が null) 日はスキップする。 */
  skipNonWorkingDays: boolean;
}

export interface BulkBreakResult {
  inserted: number;
  skippedNonWorking: number;
  skippedDuplicate: number;
  error?: string;
}

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayOf(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

/**
 * 複数スタッフ × 日付範囲 × 曜日フィルタで、休憩 (slot-block appointment) を
 * 一括投入する。
 *
 * 既存の `createAppointment` を経由しない:
 *   - email 送信 / extension-zone 判定 / 来店経路バリデーションが不要
 *   - 毎回 1 行の INSERT はコスト高いので、行をまとめて bulk insert
 *
 * 重複判定: 同 (staff_id, start_at, end_at, slot_block_type_code='break')
 * の未削除行があればスキップ。再実行しても冪等。
 */
export async function bulkInsertBreaks(
  input: BulkBreakInput
): Promise<BulkBreakResult> {
  // ---- Validation ----------------------------------------------------------
  if (!input.staffIds || input.staffIds.length === 0) {
    return {
      inserted: 0,
      skippedNonWorking: 0,
      skippedDuplicate: 0,
      error: "対象スタッフを1名以上選択してください",
    };
  }
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return {
      inserted: 0,
      skippedNonWorking: 0,
      skippedDuplicate: 0,
      error: "日付の形式が不正です",
    };
  }
  if (input.startDate > input.endDate) {
    return {
      inserted: 0,
      skippedNonWorking: 0,
      skippedDuplicate: 0,
      error: "開始日は終了日以前にしてください",
    };
  }
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
    return {
      inserted: 0,
      skippedNonWorking: 0,
      skippedDuplicate: 0,
      error: "時刻の形式が不正です",
    };
  }
  if (input.startTime >= input.endTime) {
    return {
      inserted: 0,
      skippedNonWorking: 0,
      skippedDuplicate: 0,
      error: "開始時刻は終了時刻より前にしてください",
    };
  }

  const weekdayFilter =
    input.weekdays && input.weekdays.length > 0
      ? new Set(input.weekdays)
      : null;

  // ---- Expand dates --------------------------------------------------------
  const targetDates: string[] = [];
  for (
    let d = input.startDate;
    d <= input.endDate;
    d = addDays(d, 1)
  ) {
    if (weekdayFilter && !weekdayFilter.has(weekdayOf(d))) continue;
    targetDates.push(d);
  }
  if (targetDates.length === 0) {
    return {
      inserted: 0,
      skippedNonWorking: 0,
      skippedDuplicate: 0,
      error: "指定された条件に当てはまる日がありません",
    };
  }

  // ---- Resolve working staff per date (parallel) ---------------------------
  // skipNonWorkingDays=false の場合はこの解決をスキップしてコストを節約。
  const workingMap = new Map<string, Set<number>>();
  if (input.skipNonWorkingDays) {
    const shifts = await Promise.all(
      targetDates.map((d) => getEffectiveShifts(input.shopId, d))
    );
    targetDates.forEach((d, i) => {
      const workingIds = new Set<number>(
        shifts[i]
          .filter((s) => s.startTime !== null)
          .map((s) => s.staffId)
      );
      workingMap.set(d, workingIds);
    });
  }

  // ---- Build candidate rows ------------------------------------------------
  type CandidateRow = {
    staff_id: number;
    start_at: string;
    end_at: string;
  };
  const candidates: CandidateRow[] = [];
  let skippedNonWorking = 0;

  for (const date of targetDates) {
    const workingSet = input.skipNonWorkingDays
      ? workingMap.get(date) ?? new Set<number>()
      : null;

    for (const staffId of input.staffIds) {
      if (workingSet && !workingSet.has(staffId)) {
        skippedNonWorking++;
        continue;
      }
      candidates.push({
        staff_id: staffId,
        start_at: `${date}T${input.startTime}:00`,
        end_at: `${date}T${input.endTime}:00`,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      inserted: 0,
      skippedNonWorking,
      skippedDuplicate: 0,
    };
  }

  // ---- Detect duplicates (same staff + same start_at + existing break) -----
  const supabase = await createClient();

  const candidateStarts = Array.from(
    new Set(candidates.map((c) => c.start_at))
  );
  const candidateStaffIds = Array.from(
    new Set(candidates.map((c) => c.staff_id))
  );

  const { data: existingBreaks, error: dupErr } = await supabase
    .from("appointments")
    .select("staff_id, start_at, end_at")
    .eq("shop_id", input.shopId)
    .eq("slot_block_type_code", "break")
    .in("staff_id", candidateStaffIds)
    .in("start_at", candidateStarts)
    .is("deleted_at", null);
  if (dupErr) {
    return {
      inserted: 0,
      skippedNonWorking,
      skippedDuplicate: 0,
      error: dupErr.message,
    };
  }

  const duplicateKeys = new Set(
    (existingBreaks ?? []).map(
      (r: { staff_id: number; start_at: string; end_at: string }) =>
        `${r.staff_id}|${r.start_at}|${r.end_at}`
    )
  );

  const toInsert: Array<Record<string, unknown>> = [];
  let skippedDuplicate = 0;
  const baseCodePrefix = `APT-${input.shopId}-${Date.now()}`;
  let idx = 0;
  for (const c of candidates) {
    const key = `${c.staff_id}|${c.start_at}|${c.end_at}`;
    if (duplicateKeys.has(key)) {
      skippedDuplicate++;
      continue;
    }
    // Same batch can still contain duplicates of its own (should not happen
    // from the UI, but guard anyway).
    duplicateKeys.add(key);

    toInsert.push({
      brand_id: input.brandId,
      shop_id: input.shopId,
      staff_id: c.staff_id,
      customer_id: null,
      menu_manage_id: "SYS-BREAK",
      type: 3,
      slot_block_type_code: "break",
      start_at: c.start_at,
      end_at: c.end_at,
      status: 0,
      sales: 0,
      is_couple: false,
      code: `${baseCodePrefix}-${idx++}`,
    });
  }

  if (toInsert.length === 0) {
    return {
      inserted: 0,
      skippedNonWorking,
      skippedDuplicate,
    };
  }

  const { error: insErr } = await supabase
    .from("appointments")
    .insert(toInsert);
  if (insErr) {
    return {
      inserted: 0,
      skippedNonWorking,
      skippedDuplicate,
      error: insErr.message,
    };
  }

  revalidatePath("/shift-schedule");
  revalidatePath("/reservation");

  return {
    inserted: toInsert.length,
    skippedNonWorking,
    skippedDuplicate,
  };
}
