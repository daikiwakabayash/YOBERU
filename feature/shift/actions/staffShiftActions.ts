"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { staffShiftSchema } from "../schema/shift.schema";
import { revalidatePath } from "next/cache";

export async function createStaffShift(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = staffShiftSchema.safeParse({
    ...raw,
    staff_id: Number(raw.staff_id),
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    work_pattern_id: Number(raw.work_pattern_id),
    is_public: raw.is_public === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.from("staff_shifts").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/shift-schedule");
  return { success: true };
}

export async function updateStaffShift(id: number, formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = staffShiftSchema.safeParse({
    ...raw,
    staff_id: Number(raw.staff_id),
    brand_id: Number(raw.brand_id),
    shop_id: Number(raw.shop_id),
    work_pattern_id: Number(raw.work_pattern_id),
    is_public: raw.is_public === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("staff_shifts")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/shift-schedule");
  return { success: true };
}

export async function deleteStaffShift(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_shifts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/shift-schedule");
  return { success: true };
}

interface BulkShiftEntry {
  staff_id: number;
  brand_id: number;
  shop_id: number;
  work_pattern_id: number | null;
  start_date: string;
  start_time: string;
  end_time: string;
}

/**
 * Bulk upsert staff shifts for a week.
 * Soft-deletes existing staff_shifts for the given staff+dates, then inserts new ones.
 */
export async function bulkUpsertStaffShifts(shifts: BulkShiftEntry[]) {
  const supabase = await createClient();

  // Group by unique staff_id + start_date pairs to know what to clear
  const keysToDelete = new Set<string>();
  const staffIds = new Set<number>();
  const dates = new Set<string>();

  for (const shift of shifts) {
    keysToDelete.add(`${shift.staff_id}-${shift.start_date}`);
    staffIds.add(shift.staff_id);
    dates.add(shift.start_date);
  }

  // Soft-delete existing entries for these staff + date combos
  if (staffIds.size > 0 && dates.size > 0) {
    const shopId = shifts[0].shop_id;
    const sortedDates = Array.from(dates).sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    // Fetch existing entries to selectively soft-delete
    const { data: existing } = await supabase
      .from("staff_shifts")
      .select("id, staff_id, start_date")
      .eq("shop_id", shopId)
      .in("staff_id", Array.from(staffIds))
      .gte("start_date", startDate)
      .lte("start_date", endDate)
      .is("deleted_at", null);

    if (existing && existing.length > 0) {
      const idsToDelete = existing
        .filter((e: { id: number; staff_id: number; start_date: string }) =>
          keysToDelete.has(`${e.staff_id}-${e.start_date}`)
        )
        .map((e: { id: number }) => e.id);

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("staff_shifts")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", idsToDelete);
        if (deleteError) return { error: deleteError.message };
      }
    }
  }

  // Insert new entries (only those with a work_pattern_id, i.e. not day-off)
  const toInsert = shifts
    .filter((s) => s.work_pattern_id !== null)
    .map((s) => ({
      staff_id: s.staff_id,
      brand_id: s.brand_id,
      shop_id: s.shop_id,
      work_pattern_id: s.work_pattern_id,
      start_date: s.start_date,
      start_time: s.start_time,
      end_time: s.end_time,
      is_public: true,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("staff_shifts")
      .insert(toInsert);
    if (insertError) return { error: insertError.message };
  }

  revalidatePath("/shift-schedule");
  return { success: true };
}
