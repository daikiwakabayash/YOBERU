"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Coffee, Play, MapPin, Loader2 } from "lucide-react";
import { recordPunch, type PunchType } from "../actions/punchActions";
import type { TimeRecordRow } from "../services/getTodayPunches";
import { haversineMeters } from "../utils/haversine";

interface Props {
  staffId: number;
  staffName: string;
  shopName: string;
  shopAddress: string | null;
  shopLatitude: number | null;
  shopLongitude: number | null;
  punchRadiusM: number;
  todayPunches: TimeRecordRow[];
}

interface CurrentLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * モバイル前提の打刻 UI。
 *
 * - ページ表示時に Geolocation API で 1 回だけ位置取得。
 * - 取れたら「店舗から N m / 許可 1000 m」のステータス表示。
 *   許可半径を超えていたらボタンは無効化 (見た目だけ。サーバ側でも
 *   再判定する)。
 * - 出勤 / 休憩入 / 休憩戻 / 退勤 の 4 ボタン。今日の打刻状態に応じて
 *   次に打てるアクションだけハイライトする。
 */
export function PunchClient({
  staffId,
  staffName,
  shopName,
  shopAddress,
  shopLatitude,
  shopLongitude,
  punchRadiusM,
  todayPunches,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  function fetchLocation() {
    if (!navigator.geolocation) {
      setLocationError("お使いの端末では位置情報が利用できません");
      setLocationLoading(false);
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocationLoading(false);
      },
      (err) => {
        setLocationError(
          err.code === 1
            ? "位置情報の利用が拒否されています。ブラウザの設定で許可してください。"
            : `位置情報を取得できません (${err.message})`
        );
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  useEffect(() => {
    // 初回マウント直後に位置取得。set-state-in-effect 警告を避けるため
    // microtask 1 段ずらして呼ぶ。
    queueMicrotask(() => fetchLocation());
  }, []);

  const distanceM =
    location && shopLatitude != null && shopLongitude != null
      ? haversineMeters(shopLatitude, shopLongitude, location.lat, location.lng)
      : null;
  const inRange = distanceM != null && distanceM <= punchRadiusM;

  // 状態判定
  const lastIn = [...todayPunches].reverse().find((p) => p.type === "clock_in");
  const lastOut = [...todayPunches].reverse().find((p) => p.type === "clock_out");
  const lastBreakStart = [...todayPunches]
    .reverse()
    .find((p) => p.type === "break_start");
  const lastBreakEnd = [...todayPunches]
    .reverse()
    .find((p) => p.type === "break_end");

  const isClockedIn = !!lastIn && (!lastOut || lastIn.id > lastOut.id);
  const isOnBreak =
    !!lastBreakStart &&
    (!lastBreakEnd || lastBreakStart.id > lastBreakEnd.id) &&
    isClockedIn;

  function submit(type: PunchType) {
    if (!location) {
      toast.error("位置情報を取得してから操作してください");
      return;
    }
    if (shopLatitude == null || shopLongitude == null) {
      toast.error("店舗の位置情報が未登録です");
      return;
    }
    start(async () => {
      const res = await recordPunch({
        staffId,
        type,
        latitude: location.lat,
        longitude: location.lng,
        accuracyM: location.accuracy,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const labelMap: Record<PunchType, string> = {
        clock_in: "出勤",
        clock_out: "退勤",
        break_start: "休憩開始",
        break_end: "休憩戻り",
      };
      toast.success(`${labelMap[type]} を記録しました`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-500">スタッフ</div>
        <div className="text-lg font-bold">{staffName}</div>
        <div className="mt-2 text-xs text-gray-500">所属店舗</div>
        <div className="text-sm font-medium">{shopName}</div>
        {shopAddress && (
          <div className="text-[11px] text-gray-500">{shopAddress}</div>
        )}
      </div>

      {/* 位置情報ステータス */}
      <div
        className={`rounded-lg border p-4 text-sm ${
          locationLoading
            ? "border-gray-200 bg-gray-50"
            : locationError
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : inRange
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <div className="flex items-center gap-2">
          {locationLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
          <span className="font-bold">
            {locationLoading
              ? "位置情報を取得中..."
              : locationError
                ? "位置情報エラー"
                : inRange
                  ? "店舗の範囲内です"
                  : "店舗の範囲外です"}
          </span>
        </div>
        {locationError && <p className="mt-1 text-xs">{locationError}</p>}
        {distanceM != null && (
          <p className="mt-1 text-xs">
            店舗からの距離:{" "}
            <span className="font-bold tabular-nums">
              {Math.round(distanceM)} m
            </span>
            {" / 許可範囲: "}
            <span className="font-bold tabular-nums">{punchRadiusM} m</span>
            {location?.accuracy && (
              <> (GPS 精度 ±{Math.round(location.accuracy)} m)</>
            )}
          </p>
        )}
        {(shopLatitude == null || shopLongitude == null) && (
          <p className="mt-1 text-xs">
            店舗の緯度経度が未設定です。本部で店舗マスタの座標登録が必要です。
          </p>
        )}
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={fetchLocation}
            disabled={locationLoading}
          >
            位置情報を再取得
          </Button>
        </div>
      </div>

      {/* 打刻ボタン */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          size="lg"
          className="h-20 text-base"
          variant={!isClockedIn ? "default" : "outline"}
          disabled={pending || !inRange || isClockedIn}
          onClick={() => submit("clock_in")}
        >
          <LogIn className="mr-2 h-5 w-5" />
          出勤
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-20 text-base"
          variant={isClockedIn && !isOnBreak ? "default" : "outline"}
          disabled={pending || !inRange || !isClockedIn}
          onClick={() => submit("clock_out")}
        >
          <LogOut className="mr-2 h-5 w-5" />
          退勤
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-16 text-base"
          variant="outline"
          disabled={pending || !inRange || !isClockedIn || isOnBreak}
          onClick={() => submit("break_start")}
        >
          <Coffee className="mr-2 h-4 w-4" />
          休憩開始
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-16 text-base"
          variant="outline"
          disabled={pending || !inRange || !isOnBreak}
          onClick={() => submit("break_end")}
        >
          <Play className="mr-2 h-4 w-4" />
          休憩戻り
        </Button>
      </div>

      {/* 今日の履歴 */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-sm font-bold">今日の打刻</h2>
        {todayPunches.length === 0 ? (
          <p className="text-xs text-gray-500">まだ打刻はありません</p>
        ) : (
          <ul className="divide-y text-sm">
            {todayPunches.map((p) => (
              <li key={p.id} className="flex justify-between py-1.5">
                <span>{labelOf(p.type)}</span>
                <span className="tabular-nums text-gray-600">
                  {formatTime(p.recordedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function labelOf(t: PunchType): string {
  switch (t) {
    case "clock_in":
      return "出勤";
    case "clock_out":
      return "退勤";
    case "break_start":
      return "休憩開始";
    case "break_end":
      return "休憩戻り";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
  return f.format(d);
}
