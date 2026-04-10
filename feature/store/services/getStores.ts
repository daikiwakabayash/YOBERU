"use server";
import { createClient } from "@/helper/lib/supabase/server";

/**
 * Fetch all stores for a brand.
 * Fetches areas separately to avoid Supabase implicit join failures.
 */
export async function getStores(brandId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("sort_number");
  if (error) throw error;
  const rows = data ?? [];

  const areaIds = Array.from(
    new Set(
      rows
        .map((r) => r.area_id as number | null)
        .filter((id): id is number => id != null)
    )
  );
  let areaMap = new Map<number, string>();
  if (areaIds.length > 0) {
    const { data: areas } = await supabase
      .from("areas")
      .select("id, name")
      .in("id", areaIds);
    areaMap = new Map(
      (areas ?? []).map((a: { id: number; name: string }) => [a.id, a.name])
    );
  }

  return rows.map((r) => ({
    ...r,
    areas: r.area_id
      ? { name: areaMap.get(r.area_id as number) ?? "-" }
      : null,
  }));
}

export async function getStore(id: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;

  let areaName: string | null = null;
  if (data?.area_id) {
    const { data: area } = await supabase
      .from("areas")
      .select("name")
      .eq("id", data.area_id)
      .single();
    areaName = area?.name ?? null;
  }
  return { ...data, areas: areaName ? { name: areaName } : null };
}
