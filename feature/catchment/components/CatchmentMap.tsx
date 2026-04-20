"use client";

import { useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Popup,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  CatchmentData,
  CatchmentPoint,
} from "../services/getCatchmentCustomers";

interface Props {
  data: CatchmentData;
  visitSources: Array<{ id: number; name: string }>;
}

type ColorMode = "status" | "source" | "age";

const SOURCE_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#10b981", // emerald
  "#a855f7", // purple
  "#f59e0b", // amber
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#f97316", // orange
  "#6b7280", // gray
];

const RADIUS_OPTIONS = [1, 3, 5, 10] as const; // km

const AGE_BUCKETS: Array<{ label: string; min: number; max: number; color: string }> = [
  { label: "〜19", min: 0, max: 19, color: "#a3e635" },
  { label: "20-29", min: 20, max: 29, color: "#3b82f6" },
  { label: "30-39", min: 30, max: 39, color: "#10b981" },
  { label: "40-49", min: 40, max: 49, color: "#f59e0b" },
  { label: "50-59", min: 50, max: 59, color: "#ef4444" },
  { label: "60+", min: 60, max: 999, color: "#a855f7" },
];

export function CatchmentMap({ data, visitSources }: Props) {
  const [filterMember, setFilterMember] = useState<"all" | "member" | "ticket">("all");
  const [selectedSources, setSelectedSources] = useState<Set<number | null>>(
    new Set([...visitSources.map((s) => s.id), null])
  );
  const [colorMode, setColorMode] = useState<ColorMode>("status");
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [showRadius, setShowRadius] = useState<boolean>(true);
  const [ageFilter, setAgeFilter] = useState<Set<number>>(
    new Set(AGE_BUCKETS.map((_, i) => i))
  );
  // 期間フィルタ (last_visit_date 基準)。空 = 全期間。
  const [periodEnabled, setPeriodEnabled] = useState(false);
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthAgoISO = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [periodStart, setPeriodStart] = useState<string>(monthAgoISO);
  const [periodEnd, setPeriodEnd] = useState<string>(todayISO);

  const filteredPoints = useMemo(() => {
    return data.points.filter((p) => {
      if (filterMember === "member" && !p.isMember) return false;
      if (filterMember === "ticket" && !p.hasTicket) return false;
      if (!selectedSources.has(p.visitSourceId ?? null)) return false;
      if (p.age != null) {
        const bucketIdx = AGE_BUCKETS.findIndex(
          (b) => p.age! >= b.min && p.age! <= b.max
        );
        if (bucketIdx >= 0 && !ageFilter.has(bucketIdx)) return false;
      }
      if (periodEnabled) {
        if (!p.lastVisitDate) return false;
        if (p.lastVisitDate < periodStart) return false;
        if (p.lastVisitDate > periodEnd) return false;
      }
      return true;
    });
  }, [
    data.points,
    filterMember,
    selectedSources,
    ageFilter,
    periodEnabled,
    periodStart,
    periodEnd,
  ]);

  const center: [number, number] = data.shop
    ? [data.shop.lat, data.shop.lng]
    : filteredPoints[0]
      ? [filteredPoints[0].lat, filteredPoints[0].lng]
      : [35.681, 139.767]; // 東京駅

  const sourceColorMap = useMemo(() => {
    const m = new Map<number | null, string>();
    visitSources.forEach((s, i) => m.set(s.id, SOURCE_COLORS[i % SOURCE_COLORS.length]));
    m.set(null, "#9ca3af");
    return m;
  }, [visitSources]);

  function colorOf(p: CatchmentPoint): string {
    if (colorMode === "source") return sourceColorMap.get(p.visitSourceId ?? null) ?? "#9ca3af";
    if (colorMode === "age") {
      if (p.age == null) return "#9ca3af";
      const b = AGE_BUCKETS.find((b) => p.age! >= b.min && p.age! <= b.max);
      return b?.color ?? "#9ca3af";
    }
    // status
    if (p.isMember) return "#ef4444"; // red = 会員
    if (p.hasTicket) return "#f59e0b"; // amber = 回数券
    return "#3b82f6"; // blue = 非会員
  }

  // Radius → 半径統計
  const radiusStats = useMemo(() => {
    if (!data.shop) return null;
    const counts = RADIUS_OPTIONS.map((r) => {
      const inside = filteredPoints.filter(
        (p) => distanceKm(data.shop!, p) <= r
      ).length;
      return { r, inside };
    });
    return counts;
  }, [filteredPoints, data.shop]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      {/* ---- Filter Panel ---- */}
      <div className="space-y-4 rounded-lg border bg-white p-4">
        {!data.shop && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
            店舗住所から座標を取得できませんでした。
            <br />
            店舗設定の住所と郵便番号を確認してください。
          </div>
        )}
        <div>
          <div className="mb-2 text-xs font-bold text-gray-700">対象</div>
          <div className="flex flex-col gap-1 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="member"
                checked={filterMember === "all"}
                onChange={() => setFilterMember("all")}
              />
              全顧客
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="member"
                checked={filterMember === "ticket"}
                onChange={() => setFilterMember("ticket")}
              />
              回数券購入者
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="member"
                checked={filterMember === "member"}
                onChange={() => setFilterMember("member")}
              />
              会員登録済み
            </label>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700">期間で絞り込み</span>
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              <input
                type="checkbox"
                checked={periodEnabled}
                onChange={(e) => setPeriodEnabled(e.target.checked)}
              />
              有効
            </label>
          </div>
          {periodEnabled && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="h-7 w-full rounded-md border px-1 text-[11px]"
              />
              <span className="text-[10px] text-gray-400">〜</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="h-7 w-full rounded-md border px-1 text-[11px]"
              />
            </div>
          )}
          <div className="mt-1 text-[10px] text-gray-400">
            最終来院日が範囲内の顧客のみ表示
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold text-gray-700">媒体</div>
          <div className="flex flex-col gap-1 text-xs">
            {visitSources.map((s, i) => (
              <label key={s.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedSources.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(selectedSources);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setSelectedSources(next);
                  }}
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                />
                {s.name}
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedSources.has(null)}
                onChange={(e) => {
                  const next = new Set(selectedSources);
                  if (e.target.checked) next.add(null);
                  else next.delete(null);
                  setSelectedSources(next);
                }}
              />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
              (不明)
            </label>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold text-gray-700">年齢層</div>
          <div className="flex flex-col gap-1 text-xs">
            {AGE_BUCKETS.map((b, i) => (
              <label key={b.label} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ageFilter.has(i)}
                  onChange={(e) => {
                    const next = new Set(ageFilter);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setAgeFilter(next);
                  }}
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                {b.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold text-gray-700">ピン色分け</div>
          <select
            className="h-8 w-full rounded-md border px-2 text-xs"
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
          >
            <option value="status">会員 / 回数券 / 非会員</option>
            <option value="source">媒体別</option>
            <option value="age">年齢層別</option>
          </select>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold text-gray-700">商圏 (半径)</div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showRadius}
              onChange={(e) => setShowRadius(e.target.checked)}
            />
            同心円を表示
          </label>
          <div className="mt-1 flex gap-1">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRadiusKm(r)}
                className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                  radiusKm === r
                    ? "border-blue-400 bg-blue-50 font-bold text-blue-700"
                    : "text-gray-600"
                }`}
              >
                {r}km
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="rounded-md border bg-gray-50 p-2 text-[11px] text-gray-700">
          <div>表示中: <b>{filteredPoints.length}</b> 名</div>
          <div>
            全顧客 {data.stats.totalCustomers} / 位置情報あり{" "}
            {data.stats.geocodedCustomers}
            {data.stats.pending > 0 && (
              <span className="ml-1 text-amber-600">
                ({data.stats.pending} 件残処理中)
              </span>
            )}
          </div>
          {radiusStats && (
            <div className="mt-2 border-t pt-2">
              <div className="font-bold">半径内顧客数</div>
              {radiusStats.map((s) => (
                <div key={s.r} className="flex justify-between">
                  <span>〜{s.r}km</span>
                  <span>
                    {s.inside}名 (
                    {filteredPoints.length > 0
                      ? Math.round((s.inside / filteredPoints.length) * 100)
                      : 0}
                    %)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Map ---- */}
      <div className="overflow-hidden rounded-lg border bg-white">
        <div style={{ height: 620, width: "100%" }}>
          <MapContainer
            center={center}
            zoom={12}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {data.shop && (
              <Marker
                position={[data.shop.lat, data.shop.lng]}
                icon={shopIcon()}
              >
                <Popup>
                  <div className="text-xs font-bold">{data.shop.name}</div>
                  <div className="text-[11px] text-gray-500">店舗</div>
                </Popup>
              </Marker>
            )}
            {data.shop && showRadius &&
              RADIUS_OPTIONS.filter((r) => r <= radiusKm).map((r) => (
                <Circle
                  key={r}
                  center={[data.shop!.lat, data.shop!.lng]}
                  radius={r * 1000}
                  pathOptions={{
                    color: "#3b82f6",
                    weight: 1,
                    fillOpacity: r === radiusKm ? 0.05 : 0,
                  }}
                />
              ))}
            {filteredPoints.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={6}
                pathOptions={{
                  color: "white",
                  weight: 1.5,
                  fillColor: colorOf(p),
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold">{p.name ?? "(名無し)"}</div>
                    <div className="text-gray-500">
                      No.{p.code ?? "-"}
                      {p.age != null && ` / ${p.age}歳`}
                      {p.gender === 1 && " / 男性"}
                      {p.gender === 2 && " / 女性"}
                    </div>
                    {p.visitSourceName && (
                      <div className="text-gray-500">
                        媒体: {p.visitSourceName}
                      </div>
                    )}
                    <div className="mt-1 flex gap-1">
                      {p.isMember && (
                        <span className="rounded bg-red-100 px-1 text-[10px] text-red-700">
                          会員
                        </span>
                      )}
                      {p.hasTicket && (
                        <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                          回数券
                        </span>
                      )}
                      <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-700">
                        {p.visitCount}回来院
                      </span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

// Haversine 距離 (km)
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function shopIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:#111827; color:white; width:28px; height:28px;
      border-radius:50%; border:3px solid white; box-shadow:0 2px 4px rgba(0,0,0,.3);
      display:flex; align-items:center; justify-content:center;
      font-weight:900; font-size:14px;
    ">🏠</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
