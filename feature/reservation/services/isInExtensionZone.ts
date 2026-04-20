"use server";

import { getEffectiveShifts } from "@/feature/shift/services/getStaffShifts";

/**
 * 「継続決済枠」(extension zone) の判定。
 *
 * 営業時間 = 当日の各スタッフの effective shift end の最大値。
 * その時刻 〜 +2時間 までが「継続決済 only」のフリーゾーン。
 *
 *   通常営業: 9:00 - 21:00
 *   継続決済枠: 21:00 - 23:00 (この時間に通常予約は入れない)
 *
 * Returns:
 *   - inExtension: true なら start_at が継続決済枠に入っている
 *   - shopEndMin: 当日の営業終了時刻 (分単位 from midnight)。0 なら判定不能
 */
export async function isInExtensionZone(
  shopId: number,
  startAt: string
): Promise<{ inExtension: boolean; shopEndMin: number }> {
  // start_at = 'YYYY-MM-DDTHH:MM:00' (公開予約 / 管理画面共通フォーマット)
  const date = startAt.slice(0, 10);
  const startHHMM = startAt.slice(11, 16);
  const [hh, mm] = startHHMM.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { inExtension: false, shopEndMin: 0 };
  }
  const startMin = hh * 60 + mm;

  let shifts: Awaited<ReturnType<typeof getEffectiveShifts>> = [];
  try {
    shifts = await getEffectiveShifts(shopId, date);
  } catch {
    return { inExtension: false, shopEndMin: 0 };
  }

  let maxEndMin = 0;
  for (const s of shifts) {
    if (!s.endTime) continue;
    const [eh, em] = s.endTime.split(":").map(Number);
    if (!Number.isFinite(eh) || !Number.isFinite(em)) continue;
    const v = eh * 60 + em;
    if (v > maxEndMin) maxEndMin = v;
  }
  if (maxEndMin === 0) return { inExtension: false, shopEndMin: 0 };

  // 営業終了 〜 +2 時間 = 継続決済 only
  const inExtension = startMin >= maxEndMin && startMin < maxEndMin + 120;
  return { inExtension, shopEndMin: maxEndMin };
}
