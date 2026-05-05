import { Card } from "@/components/ui/card";
import { LineChart, AlertCircle } from "lucide-react";
import { yen, num, pct } from "@/feature/marketing/components/format";

interface Props {
  startDate: string;
  endDate: string;
  metaTotals: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
  };
  /** Meta 経由の予約 (= visit_source = "メタ" の appointments) を期間集計したもの */
  metaAppointments: {
    bookings: number;
    visits: number;
    sales: number;
  };
  /** 比較用: 全媒体の合計 */
  allMedia: {
    bookings: number;
    visits: number;
    sales: number;
  };
}

/**
 * メタ分析タブ。Meta インサイトと appointments を媒体軸で照合し、
 * Click → 予約 (CVR) / 予約 → 来院 (来院率) / 来院 → 売上 (LTV) を出す。
 *
 * meta_ad_insights が無い、または visit_sources にメタが紐付いていない
 * 場合は注意書きだけ出す。
 */
export function MetaAnalysisTab({
  startDate,
  endDate,
  metaTotals,
  metaAppointments,
  allMedia,
}: Props) {
  const noData =
    metaTotals.impressions === 0 &&
    metaTotals.clicks === 0 &&
    metaAppointments.bookings === 0;

  if (noData) {
    return (
      <Card className="border-amber-200 bg-amber-50/40 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-2 text-sm text-amber-900">
            <div className="text-base font-bold">
              メタ分析データがありません
            </div>
            <p>
              この期間に Meta 広告のインサイトデータと、来店経路 = メタ の
              予約データの両方が揃っていません。「メタ広告」タブで連携を
              設定し、新規予約に「メタ」媒体を選択する運用を確立してから
              再度ご確認ください。
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const cvrClickToBooking =
    metaTotals.clicks > 0 ? metaAppointments.bookings / metaTotals.clicks : 0;
  const visitRate =
    metaAppointments.bookings > 0
      ? metaAppointments.visits / metaAppointments.bookings
      : 0;
  const cpa =
    metaAppointments.visits > 0
      ? metaTotals.spend / metaAppointments.visits
      : 0;
  const roas =
    metaTotals.spend > 0 ? metaAppointments.sales / metaTotals.spend : 0;
  const metaShareOfBookings =
    allMedia.bookings > 0 ? metaAppointments.bookings / allMedia.bookings : 0;
  const metaShareOfSales =
    allMedia.sales > 0 ? metaAppointments.sales / allMedia.sales : 0;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-gradient-to-r from-purple-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <LineChart className="h-4 w-4 text-purple-500" />
          メタ広告 → 予約 → 来店 ファネル ({startDate} 〜 {endDate})
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Funnel label="Impression" value={num(metaTotals.impressions)} />
          <Funnel
            label="クリック"
            value={num(metaTotals.clicks)}
            sub={`CTR ${pct(metaTotals.ctr)}`}
          />
          <Funnel
            label="予約"
            value={num(metaAppointments.bookings)}
            sub={`CVR ${pct(cvrClickToBooking)}`}
            tone="bg-blue-50"
          />
          <Funnel
            label="来店"
            value={num(metaAppointments.visits)}
            sub={`来店率 ${pct(visitRate)}`}
            tone="bg-emerald-50"
          />
          <Funnel
            label="CPA"
            value={yen(Math.round(cpa))}
            sub={`= 消化 / 来店`}
            tone="bg-amber-50"
          />
          <Funnel
            label="ROAS"
            value={`${(roas * 100).toFixed(0)}%`}
            sub={`売上 ${yen(metaAppointments.sales)}`}
            tone="bg-rose-50"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-gray-50 px-5 py-2 text-xs font-bold text-gray-700">
          媒体内シェア
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
          <Funnel
            label="メタの予約シェア"
            value={pct(metaShareOfBookings)}
            sub={`${metaAppointments.bookings} / ${allMedia.bookings} 件`}
            tone="bg-blue-50"
          />
          <Funnel
            label="メタの売上シェア"
            value={pct(metaShareOfSales)}
            sub={`${yen(metaAppointments.sales)} / ${yen(allMedia.sales)}`}
            tone="bg-emerald-50"
          />
          <Funnel
            label="メタ消化"
            value={yen(metaTotals.spend)}
            sub="期間合計"
            tone="bg-orange-50"
          />
        </div>
      </Card>
    </div>
  );
}

function Funnel({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone ?? "bg-white"}`}>
      <div className="text-[10px] font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-black text-gray-900">{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  );
}
