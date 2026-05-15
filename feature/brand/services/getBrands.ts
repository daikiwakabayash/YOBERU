"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface BrandRow {
  id: number;
  name: string;
  code: string | null;
  frameMin: number | null;
  ghostTime: string | null;
  copyright: string | null;
  logoUrl: string | null;
  createdAt: string;
}

export async function getBrands(): Promise<BrandRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select(
      "id, name, code, frame_min, ghost_time, copyright, logo_url, created_at"
    )
    .is("deleted_at", null)
    .order("id", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as number,
    name: (r.name as string) ?? "",
    code: (r.code as string | null) ?? null,
    frameMin: (r.frame_min as number | null) ?? null,
    ghostTime: (r.ghost_time as string | null) ?? null,
    copyright: (r.copyright as string | null) ?? null,
    logoUrl: (r.logo_url as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function isCurrentUserRoot(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { data } = await supabase
    .from("users")
    .select("brand_id")
    .eq("email", user.email)
    .maybeSingle();
  if (!data) return false;
  return data.brand_id == null;
}
