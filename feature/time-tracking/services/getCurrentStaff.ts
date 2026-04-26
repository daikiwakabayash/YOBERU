"use server";

import { createClient } from "@/helper/lib/supabase/server";

export interface CurrentStaffWithShop {
  staffId: number;
  staffName: string;
  shopId: number;
  shopName: string;
  shopAddress: string | null;
  shopLatitude: number | null;
  shopLongitude: number | null;
  punchRadiusM: number;
}

/**
 * ログインユーザーに紐付くスタッフ + 所属店舗 + 打刻半径を返す。
 * 1 ユーザーが複数 staff レコードを持つケース (兼任) はまだ想定外なので
 * 1 件目を返している。
 */
export async function getCurrentStaffWithShop(): Promise<CurrentStaffWithShop | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;

  const { data: publicUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  if (!publicUser) return null;

  const { data: staff } = await supabase
    .from("staffs")
    .select("id, name, shop_id, brand_id")
    .eq("user_id", publicUser.id)
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!staff) return null;

  const [shopRes, brandRes] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name, address, latitude, longitude")
      .eq("id", staff.shop_id as number)
      .maybeSingle(),
    supabase
      .from("brands")
      .select("punch_radius_m")
      .eq("id", staff.brand_id as number)
      .maybeSingle(),
  ]);

  const shop = shopRes.data;
  if (!shop) return null;

  return {
    staffId: staff.id as number,
    staffName: staff.name as string,
    shopId: shop.id as number,
    shopName: shop.name as string,
    shopAddress: (shop.address as string | null) ?? null,
    shopLatitude: shop.latitude == null ? null : Number(shop.latitude),
    shopLongitude: shop.longitude == null ? null : Number(shop.longitude),
    punchRadiusM:
      Number((brandRes.data?.punch_radius_m as number | undefined) ?? 0) || 1000,
  };
}
