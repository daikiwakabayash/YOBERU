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
  /**
   * 「初回来院日」がこの YYYY-MM の範囲内に入る顧客だけ返す。
   * 省略時は全顧客 (= ピン全表示)。
   * 上部の「期間」フィルタと連動させるため。
   */
  startMonth?: string | null;
  endMonth?: string | null;
}): Promise<CatchmentData> {
  const supabase = await createClient();
  const { shopId, startMonth, endMonth } = params;

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
  //   さらに「customers.first_visit_source_id が NULL」の顧客向けに、
  //   appointments から最古の visit_source_id を引いてフォールバック
  //   する。チラシ等で来院しているのに マップ側で「不明」グレーピンに
  //   倒れていた問題への対応。
  const customerIds = geocodedCustomers.map((c) => c.id as number);
  const [sourcesRes, plansRes, apptSourceRes] = await Promise.all([
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
    customerIds.length > 0
      ? supabase
          .from("appointments")
          .select("customer_id, visit_source_id, start_at")
          .in("customer_id", customerIds)
          // キャンセル系は「来た媒体」として扱わない
          .not("status", "in", "(3,4,99)")
          .is("deleted_at", null)
          .order("start_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{
          customer_id: number;
          visit_source_id: number | null;
          start_at: string;
        }> }),
  ]);
  const sourceMap = new Map<number, string>(
    (sourcesRes.data ?? []).map((s) => [s.id as number, s.name as string])
  );
  // appointments 経由の最古媒体 (= 顧客の初回来院媒体) を customer_id ごとに 1 つ
  // 同時に「初回来院年月 (YYYY-MM)」も控える (期間フィルタに使う)
  const apptFirstSourceMap = new Map<number, number>();
  const apptFirstYearMonthMap = new Map<number, string>();
  for (const r of (apptSourceRes.data ?? []) as Array<{
    customer_id: number;
    visit_source_id: number | null;
    start_at: string;
  }>) {
    if (
      !apptFirstSourceMap.has(r.customer_id) &&
      r.visit_source_id != null
    ) {
      apptFirstSourceMap.set(r.customer_id, r.visit_source_id);
    }
    if (!apptFirstYearMonthMap.has(r.customer_id) && r.start_at) {
      // start_at は ISO 文字列 (timestamptz)。先頭 7 文字が YYYY-MM。
      // (timezone offset は ±9h でも月境界がズレるリスクは月初の 0-9 時帯
      // だけなので、店舗運用 (営業時間 10-21) では問題にならない。)
      apptFirstYearMonthMap.set(r.customer_id, r.start_at.slice(0, 7));
    }
  }
  const memberSet = new Set<number>();
  const ticketSet = new Set<number>();
  for (const p of plansRes.data ?? []) {
    const cid = p.customer_id as number;
    memberSet.add(cid);
    if ((p.plan_type as string | null) === "ticket") ticketSet.add(cid);
  }

  // ---- 4.5. 期間フィルタ (URL の startMonth / endMonth) ----
  //   「初回来院年月」が範囲内に入る顧客だけ通す。初回来院記録が
  //    ない顧客 (来院前) は範囲外とみなして弾く。
  //    → 3 月の指定なら 3 月初来院の客だけがピン化される。
  function inPeriod(customerId: number): boolean {
    if (!startMonth && !endMonth) return true;
    const ym = apptFirstYearMonthMap.get(customerId);
    if (!ym) return false;
    if (startMonth && ym < startMonth) return false;
    if (endMonth && ym > endMonth) return false;
    return true;
  }
  const filteredCustomers = geocodedCustomers.filter((c) =>
    inPeriod(c.id as number)
  );

  // ---- 5. 出力用 points ----
  const today = new Date();
  const points: CatchmentPoint[] = filteredCustomers.map((c) => {
    const age = birthDateToAge(c.birth_date as string | null, today);
    const fullName =
      [c.last_name, c.first_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
    const sourceId =
      (c.first_visit_source_id as number | null) ??
      apptFirstSourceMap.get(c.id as number) ??
      null;
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
