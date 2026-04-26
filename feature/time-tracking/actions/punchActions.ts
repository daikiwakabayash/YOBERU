"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";
import { haversineMeters } from "../utils/haversine";

export type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";

const VALID_TYPES = new Set<string>([
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
]);

const DEFAULT_RADIUS_M = 1000;

export interface PunchInput {
  /** スタッフ ID。サーバ側でログインユーザーとの一致を検証する */
  staffId: number;
  type: PunchType;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  userAgent?: string | null;
  note?: string | null;
}

export interface PunchResult {
  success?: true;
  error?: string;
  /** 拒否時に「OK だった距離 / 実距離」を返してユーザーに表示する */
  distanceM?: number;
  allowedRadiusM?: number;
}

/**
 * Web 打刻を 1 件登録する。
 *
 * 検証フロー:
 *   1. ログインユーザーが当該 staffs.user_id に紐付いていること
 *   2. 端末送信の lat/lng が staffs.shop_id の店舗座標から
 *      brand.punch_radius_m (デフォルト 1km) 以内であること
 *   3. shops.latitude / longitude が未設定の場合は拒否
 *      (店舗マスタで先に住所→geocode を済ませる必要がある)
 */
export async function recordPunch(input: PunchInput): Promise<PunchResult> {
  const supabase = await createClient();

  if (!VALID_TYPES.has(input.type)) {
    return { error: `不明な打刻種別です: ${input.type}` };
  }
  if (
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude)
  ) {
    return { error: "位置情報が取得できませんでした (端末の GPS 設定を確認してください)" };
  }

  // 1. 認証ユーザー確認
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { error: "ログイン情報が確認できません。再ログインしてください。" };
  }

  // 2. auth.users.email → public.users.id を引き、staffs.user_id と一致するか
  //    照合する (本人以外の打刻を防ぐ)。
  const { data: publicUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  if (!publicUser) {
    return {
      error:
        "ユーザー連携が未設定です。本部で users.email の紐付けを行ってください。",
    };
  }

  const { data: staff, error: staffErr } = await supabase
    .from("staffs")
    .select("id, user_id, shop_id, brand_id")
    .eq("id", input.staffId)
    .is("deleted_at", null)
    .maybeSingle();
  if (staffErr || !staff) {
    return { error: "スタッフ情報が見つかりません" };
  }
  if (staff.user_id !== publicUser.id) {
    return { error: "ログイン中のユーザーではこのスタッフの打刻はできません" };
  }

  // 3. 店舗座標 + 許可半径を取得
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id, latitude, longitude")
    .eq("id", staff.shop_id as number)
    .maybeSingle();
  if (shopErr || !shop) {
    return { error: "店舗マスタが取得できません" };
  }
  const shopLat = shop.latitude as number | null;
  const shopLng = shop.longitude as number | null;
  if (shopLat == null || shopLng == null) {
    return {
      error:
        "店舗の位置情報 (緯度経度) が未設定です。店舗マスタで住所を保存して geocode を完了してください。",
    };
  }

  // 4. brand 設定 (punch_radius_m)
  let radiusM = DEFAULT_RADIUS_M;
  const { data: brand } = await supabase
    .from("brands")
    .select("punch_radius_m")
    .eq("id", staff.brand_id as number)
    .maybeSingle();
  if (brand && Number.isFinite(brand.punch_radius_m as number)) {
    radiusM = (brand.punch_radius_m as number) || DEFAULT_RADIUS_M;
  }

  // 5. Haversine 距離検証
  const distanceM = haversineMeters(
    Number(shopLat),
    Number(shopLng),
    input.latitude,
    input.longitude
  );
  if (distanceM > radiusM) {
    return {
      error: `店舗から ${Math.round(distanceM)} m 離れた場所からは打刻できません (許可範囲: ${radiusM} m)`,
      distanceM,
      allowedRadiusM: radiusM,
    };
  }

  // 6. 「勤務日」: Asia/Tokyo の日付。深夜勤務や日跨ぎ退勤は
  //    「直近の clock_in と同じ work_date」に揃えるロジックを後段で
  //    適用するが、ここでは現在時刻のローカル日付を使う。
  const workDate = toLocalDateString(new Date());

  const { error: insertErr } = await supabase.from("time_records").insert({
    staff_id: staff.id,
    shop_id: staff.shop_id,
    record_type: input.type,
    recorded_at: new Date().toISOString(),
    work_date: workDate,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_m: input.accuracyM ?? null,
    distance_m: distanceM,
    user_agent: input.userAgent ?? null,
    note: input.note ?? null,
  });
  if (insertErr) {
    return { error: insertErr.message };
  }

  revalidatePath("/punch");
  revalidatePath("/time-tracking");
  return { success: true, distanceM, allowedRadiusM: radiusM };
}
