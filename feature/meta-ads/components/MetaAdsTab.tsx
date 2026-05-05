import { Card } from "@/components/ui/card";
import { Megaphone, AlertCircle, Activity, MousePointerClick, Eye } from "lucide-react";
import type { MetaAdsSummary } from "../services/getMetaAdsSummary";
import { yen, num, pct } from "@/feature/marketing/components/format";

interface Props {
  data: MetaAdsSummary;
  startDate: string;
  endDate: string;
}

/**
 * メタ広告タブ。Meta Graph API から取り込んだ日次インサイトを
 * 期間集計して表示する。
 *
 * meta_ad_accounts が未登録 (= 連携未設定) の店舗には設定方法を
 * 案内するだけのフォールバック画面を出す。
 */
export function MetaAdsTab({ data, startDate, endDate }: Props) {
  if (!data.hasAccount) {
    return (
      <Card className="border-amber-200 bg-amber-50/40 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-2 text-sm">
            <div className="text-base font-bold text-amber-900">
              Meta 広告アカウントが未連携
            </div>
            <p className="text-amber-800">
              この店舗にはまだ Meta (Facebook / Instagram) 広告アカウントが
              登録されていません。連携すると Impression / クリック / 消化金額
              を 6 時間ごとに自動取り込みできます。
            </p>
            <ol className="ml-4 list-decimal space-y-1 text-xs text-amber-900">
              <li>
                Meta Business Manager で広告アカウント
                (<code className="rounded bg-white px-1">act_xxxxxxxxx</code>)
                とシステムユーザーアクセストークンを発行
              </li>
              <li>
                Supabase ダッシュボード →
                <code className="mx-1 rounded bg-white px-1">
                  meta_ad_accounts
                </code>
                テーブルに INSERT (
                <code className="rounded bg-white px-1">access_token_encrypted</code>{" "}
                には encryptToken() でエンコード済の値)
              </li>
              <li>
                <code className="rounded bg-white px-1">
                  GET /api/cron/sync-meta-ads?accountId=&lt;id&gt;
                </code>
                で初回同期 (Vercel Cron でも 6 時間間隔で自動実行されます)
              </li>
            </ol>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-r from-blue-50 to-white px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <Megaphone className="h-4 w-4 text-blue-500" />
            Meta 広告 ({startDate} 〜 {endDate})
          </div>
          <div className="text-[11px] text-gray-500">
            アカウント: {data.adAccountId}
            {data.displayName && ` / ${data.displayName}`}
            {data.lastSyncedAt && (
              <span className="ml-2">
                最終同期:{" "}
                {new Date(data.lastSyncedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </span>
            )}
            {data.lastSyncError && (
              <span className="ml-2 text-rose-600">
                エラー: {data.lastSyncError}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Kpi
            tone="bg-orange-50"
            icon={<Activity className="h-4 w-4 text-orange-500" />}
            label="消化金額"
            value={yen(data.totals.spend)}
            sub="期間合計"
          />
          <Kpi
            tone="bg-blue-50"
            icon={<Eye className="h-4 w-4 text-blue-500" />}
            label="Impression"
            value={num(data.totals.impressions)}
            sub={`Reach ${num(data.totals.reach)}`}
          />
          <Kpi
            tone="bg-emerald-50"
            icon={<MousePointerClick className="h-4 w-4 text-emerald-500" />}
            label="クリック"
            value={num(data.totals.clicks)}
            sub={`CTR ${pct(data.totals.ctr)}`}
          />
          <Kpi
            tone="bg-purple-50"
            icon={<Activity className="h-4 w-4 text-purple-500" />}
            label="CPC / CPM"
            value={`${yen(Math.round(data.totals.cpc))} / ${yen(
              Math.round(data.totals.cpm)
            )}`}
            sub="クリック単価 / 1000imp"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-gray-50 px-5 py-2 text-xs font-bold text-gray-700">
          キャンペーン別
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">キャンペーン</th>
                <th className="px-3 py-2 text-right font-medium">消化金額</th>
                <th className="px-3 py-2 text-right font-medium">Impression</th>
                <th className="px-3 py-2 text-right font-medium">クリック</th>
                <th className="px-3 py-2 text-right font-medium">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.byCampaign.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    データがありません
                  </td>
                </tr>
              ) : (
                data.byCampaign.map((c) => (
                  <tr key={c.metaCampaignId ?? "unknown"}>
                    <td className="px-3 py-1.5 text-gray-800">{c.name}</td>
                    <td className="px-3 py-1.5 text-right">{yen(c.spend)}</td>
                    <td className="px-3 py-1.5 text-right">{num(c.impressions)}</td>
                    <td className="px-3 py-1.5 text-right">{num(c.clicks)}</td>
                    <td className="px-3 py-1.5 text-right">{pct(c.ctr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-gray-50 px-5 py-2 text-xs font-bold text-gray-700">
          日別
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">日付</th>
                <th className="px-3 py-2 text-right font-medium">消化金額</th>
                <th className="px-3 py-2 text-right font-medium">Impression</th>
                <th className="px-3 py-2 text-right font-medium">クリック</th>
                <th className="px-3 py-2 text-right font-medium">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.byDay.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    データがありません
                  </td>
                </tr>
              ) : (
                data.byDay.map((d) => (
                  <tr key={d.date}>
                    <td className="px-3 py-1.5 text-gray-800">{d.date}</td>
                    <td className="px-3 py-1.5 text-right">{yen(d.spend)}</td>
                    <td className="px-3 py-1.5 text-right">{num(d.impressions)}</td>
                    <td className="px-3 py-1.5 text-right">{num(d.clicks)}</td>
                    <td className="px-3 py-1.5 text-right">{pct(d.ctr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-black text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}
