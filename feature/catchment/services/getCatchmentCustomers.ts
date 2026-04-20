"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { geocodeJapaneseAddress } from "./geocodeAddress";

/**
 * 商圏マップ用の顧客ピンデータを取得する。
 *
 * 未 geocode の顧客はこのサービス内で backfill する (最大 BACKFILL_LIMIT 件)。
 * 残りは次回アクセス時に取得。キャッシュは DB 列 (latitude/longitude) 自体。
 *
 * 顧客 visit_source や年齢は appointments を別クエリで引いて lookup。
 */

export interface CatchmentPoint {
  id: number;
  lat: number;
  lng: number;
  name: string | null;
  code: string | null;
  age: number | null;
  gender: number | null;
  isMember: boolean;         // customer_plans で購入あり
  hasTicket: boolean;        // 回数券を購入したか
  visitSourceId: number | null;
  visitSourceName: string | null;
  lastVisitDate: string | null; // YYYY-MM-DD (クライアント側の期間フィルタで使用)
  visitCount: number;
}

export interface CatchmentShopCenter {
  lat: number;
  lng: number;
  name: string;
}

export interface CatchmentData {
  shop: CatchmentShopCenter | null;
  shopAddress: string | null; // 失敗時の表示用
  points: CatchmentPoint[];
  stats: {
    totalCustomers: number;
    geocodedCustomers: number;
    pending: number;
    failedSamples: Array<{
      id: number;
      name: string | null;
      zip: string | null;
      address: string | null;
    }>;
  };
}

const BACKFILL_LIMIT = 100; // 1 リクエスト最大件数 (GSI API 負荷配慮)

export async function getCatchmentCustomers(params: {
  shopId: number;
}): Promise<CatchmentData> {
  const supabase = await createClient();
  const { shopId } = params;

  // ---- 1. 店舗中心を取得 (未設定なら住所から geocode) ----
  let shopCenter: CatchmentShopCenter | null = null;
  let shopAddress: string | null = null;
  {
    const { data: shop } = await supabase
      .from("shops")
      .select("id, name, zip_code, address, latitude, longitude")
      .eq("id", shopId)
      .maybeSingle();
    if (shop) {
      const name = (shop.name as string) || "店舗";
      shopAddress = (shop.address as string | null) ?? null;
      let lat = shop.latitude as number | null;
      let lng = shop.longitude as number | null;
      if ((lat == null || lng == null) && shop.address) {
        const geo = await geocodeJapaneseAddress(
          shop.zip_code as string | null,
          shop.address as string
        );
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          await supabase
            .from("shops")
            .update({
              latitude: lat,
              longitude: lng,
              geocoded_at: new Date().toISOString(),
            })
            .eq("id", shopId);
        }
      }
      if (lat != null && lng != null) {
        shopCenter = { lat: Number(lat), lng: Number(lng), name };
      }
    }
  }

  // ---- 2. 顧客取得 (全件) ----
  // 期間フィルタはクライアント側 (lastVisitDate を per-point に渡す) で
  // 行うため、ここでは全顧客を返す。max 1000 件 (それ以上は将来 pagination)。
  const customerRes = await supabase
    .from("customers")
    .select(
      "id, code, last_name, first_name, birth_date, gender, zip_code, address, latitude, longitude, first_visit_source_id, visit_count, last_visit_date"
    )
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .limit(1000);
  const allCustomers = customerRes.data ?? [];

  // ---- 3. 未 geocode 分を最大 BACKFILL_LIMIT 件まで backfill ----
  const pending = allCustomers.filter(
    (c) =>
      (c.latitude == null || c.longitude == null) &&
      ((c.address as string | null)?.trim() ?? "") !== ""
  );
  const toBackfill = pending.slice(0, BACKFILL_LIMIT);
  for (const c of toBackfill) {
    const geo = await geocodeJapaneseAddress(
      c.zip_code as string | null,
      c.address as string
    );
    if (geo) {
      c.latitude = geo.lat;
      c.longitude = geo.lng;
      await supabase
        .from("customers")
        .update({
          latitude: geo.lat,
          longitude: geo.lng,
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", c.id);
    } else {
      // geocode 失敗でも次回再試行しない (住所がゴミの場合あるため) ため
      // geocoded_at だけ設定して lat/lng は NULL のまま
      await supabase
        .from("customers")
        .update({ geocoded_at: new Date().toISOString() })
        .eq("id", c.id);
    }
  }

  const geocodedCustomers = allCustomers.filter(
    (c) => c.latitude != null && c.longitude != null
  );

  // ---- 4. 参照マスタ: visit_sources / customer_plans ----
  const [sourcesRes, plansRes] = await Promise.all([
    supabase
      .from("visit_sources")
      .select("id, name")
      .eq("shop_id", shopId)
      .is("deleted_at", null),
    supabase
      .from("customer_plans")
      .select("customer_id, plan_type")
      .eq("shop_id", shopId)
      .is("deleted_at", null),
  ]);
  const sourceMap = new Map<number, string>(
    (sourcesRes.data ?? []).map((s) => [s.id as number, s.name as string])
  );
  const memberSet = new Set<number>();
  const ticketSet = new Set<number>();
  for (const p of plansRes.data ?? []) {
    const cid = p.customer_id as number;
    memberSet.add(cid);
    if ((p.plan_type as string | null) === "ticket") ticketSet.add(cid);
  }

  // ---- 5. 出力用 points ----
  const today = new Date();
  const points: CatchmentPoint[] = geocodedCustomers.map((c) => {
    const age = birthDateToAge(c.birth_date as string | null, today);
    const fullName =
      [c.last_name, c.first_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
    const sourceId = c.first_visit_source_id as number | null;
    return {
      id: c.id as number,
      lat: Number(c.latitude),
      lng: Number(c.longitude),
      name: fullName,
      code: (c.code as string) ?? null,
      age,
      gender: (c.gender as number | null) ?? null,
      isMember: memberSet.has(c.id as number),
      hasTicket: ticketSet.has(c.id as number),
      visitSourceId: sourceId,
      visitSourceName: sourceId ? sourceMap.get(sourceId) ?? null : null,
      lastVisitDate: (c.last_visit_date as string | null) ?? null,
      visitCount: (c.visit_count as number | null) ?? 0,
    };
  });

  // 失敗サンプル: 住所はあるのに lat/lng が NULL のままのもの (最大 5)
  const stillFailed = allCustomers.filter(
    (c) =>
      (c.latitude == null || c.longitude == null) &&
      ((c.address as string | null)?.trim() ?? "") !== ""
  );
  const failedSamples = stillFailed.slice(0, 5).map((c) => ({
    id: c.id as number,
    name:
      [c.last_name, c.first_name].filter(Boolean).join(" ").trim() || null,
    zip: (c.zip_code as string | null) ?? null,
    address: (c.address as string | null) ?? null,
  }));

  return {
    shop: shopCenter,
    shopAddress,
    points,
    stats: {
      totalCustomers: allCustomers.length,
      geocodedCustomers: geocodedCustomers.length,
      pending: Math.max(0, pending.length - toBackfill.length),
      failedSamples,
    },
  };
}

function birthDateToAge(bd: string | null, today: Date): number | null {
  if (!bd) return null;
  const d = new Date(bd + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}
