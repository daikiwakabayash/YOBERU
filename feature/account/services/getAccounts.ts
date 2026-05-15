"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type { PermissionType } from "../schema/accountSchema";

export interface AccountRow {
  id: number;
  email: string;
  name: string | null;
  brandId: number | null;
  brandName: string | null;
  permissionType: PermissionType;
  hasAuthAccount: boolean;
  createdAt: string;
}

export interface BrandOption {
  id: number;
  name: string;
}

export async function getAccounts(): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, name, brand_id, created_at")
    .order("id", { ascending: true });
  if (error || !users) return [];

  const brandIds = Array.from(
    new Set(users.map((u) => u.brand_id).filter((v): v is number => v != null))
  );
  const brandMap = new Map<number, string>();
  if (brandIds.length > 0) {
    const { data: brands } = await supabase
      .from("brands")
      .select("id, name")
      .in("id", brandIds)
      .is("deleted_at", null);
    (brands ?? []).forEach((b) =>
      brandMap.set(b.id as number, b.name as string)
    );
  }

  return users.map((u) => {
    const brandId = (u.brand_id as number | null) ?? null;
    return {
      id: u.id as number,
      email: (u.email as string) ?? "",
      name: (u.name as string | null) ?? null,
      brandId,
      brandName: brandId != null ? brandMap.get(brandId) ?? null : null,
      permissionType: (brandId == null ? "root" : "limited") as PermissionType,
      hasAuthAccount: true,
      createdAt: u.created_at as string,
    };
  });
}

export async function getBrandOptions(): Promise<BrandOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .is("deleted_at", null)
    .order("id", { ascending: true });
  if (error || !data) return [];
  return data.map((b) => ({
    id: b.id as number,
    name: (b.name as string) ?? "",
  }));
}
