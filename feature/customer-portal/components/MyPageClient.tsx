"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertTriangle,
  CalendarDays,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { cancelOwnBooking } from "../actions/cancelOwnBooking";
import {
  fetchMyPageData,
  type MyPageData,
} from "../actions/myPageActions";

interface LiffApi {
  init: (opts: { liffId: string }) => Promise<void>;
  getProfile: () => Promise<{ userId: string; displayName: string }>;
}

type State =
  | { kind: "loading" }
  | { kind: "no-liff" }
  | { kind: "no-link" }
  | { kind: "ready"; data: MyPageData; lineUserId: string };

const STATUS_LABEL: Record<number, string> = {
  0: "待機中",
  1: "施術中",
  2: "完了",
  3: "キャンセル",
  4: "当日キャンセル",
  99: "no-show",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MyPageClient() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, start] = useTransition();

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
    if (!liffId) {
      setState({ kind: "no-liff" });
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    tag.async = true;
    tag.onload = init;
    tag.onerror = () => setState({ kind: "no-liff" });
    document.body.appendChild(tag);

    async function init() {
      const liff = (window as unknown as { liff?: LiffApi }).liff;
      if (!liff) return setState({ kind: "no-liff" });
      try {
        await liff.init({ liffId: liffId! });
        const profile = await liff.getProfile();
        const data = await fetchMyPageData(profile.userId);
        if (!data) {
          setState({ kind: "no-link" });
          return;
        }
        setState({ kind: "ready", data, lineUserId: profile.userId });
      } catch {
        setState({ kind: "no-liff" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doCancel(appointmentId: number) {
    if (state.kind !== "ready") return;
    if (!confirm("この予約をキャンセルしますか？")) return;
    const lineUserId = state.lineUserId;
    start(async () => {
      const res = await cancelOwnBooking({ lineUserId, appointmentId });
      if (res.error) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      toast.success("予約をキャンセルしました");
      // 再取得
      const data = await fetchMyPageData(lineUserId);
      if (data) setState({ kind: "ready", data, lineUserId });
    });
  }

  if (state.kind === "loading") {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        読み込み中...
      </div>
    );
  }

  if (state.kind === "no-liff") {
    return (
      <div className="mx-auto max-w-md p-4">
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-bold">LINE アプリ内でお開きください</span>
            </div>
            <p className="text-xs text-gray-600">
              このページは公式 LINE のリッチメニューから開いてください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "no-link") {
    return (
      <div className="mx-auto max-w-md p-4">
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-bold">紐付けがまだ完了していません</span>
            </div>
            <p className="text-xs text-gray-600">
              店舗から送られた専用リンクをタップして、お客様情報との紐付けを
              行ってください。リンクが見当たらない場合は店舗までお問い合わせ
              ください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data } = state;
  return (
    <div className="mx-auto max-w-md space-y-3 p-3 pb-12">
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="p-4">
          <div className="text-xs text-gray-600">{data.shopName}</div>
          <div className="text-base font-bold">{data.customerName} 様</div>
          <p className="mt-1 text-[11px] text-gray-500">
            キャンセル: {data.customerCanCancel ? "可" : "不可"} / 変更:{" "}
            {data.customerCanModify ? "可" : "不可"}
            {data.customerCanCancel &&
              ` (予約開始 ${data.customerCancelDeadlineHours} 時間前まで)`}
          </p>
        </CardContent>
      </Card>

      <h2 className="px-1 pt-2 text-sm font-bold">今後の予約</h2>
      {data.appointments.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-gray-500">
            今後の予約はありません
          </CardContent>
        </Card>
      ) : (
        data.appointments.map((a) => (
          <Card key={a.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                <span className="font-bold tabular-nums">
                  {formatDateTime(a.startAt)}
                </span>
                <Badge variant="outline" className="ml-auto">
                  {STATUS_LABEL[a.status] ?? "—"}
                </Badge>
              </div>
              {a.menuName && (
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <Clock className="h-3 w-3 text-gray-400" />
                  {a.menuName}
                </div>
              )}
              {a.staffName && (
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <UserIcon className="h-3 w-3 text-gray-400" />
                  {a.staffName}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {a.canCancel ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => doCancel(a.id)}
                    className="text-rose-600"
                  >
                    キャンセルする
                  </Button>
                ) : (
                  <span className="text-[10px] text-gray-400">
                    キャンセル不可
                    {data.customerCanCancel &&
                      ` (締切: 予約開始 ${data.customerCancelDeadlineHours} 時間前)`}
                  </span>
                )}
                {data.customerCanModify && (
                  <span className="text-[10px] text-gray-400">
                    予約変更は店舗にご相談ください (Phase 2)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
