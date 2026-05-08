import { PageHeader } from "@/components/layout/PageHeader";
import { MarketingFilters } from "@/feature/marketing/components/MarketingFilters";
import { MarketingOverview } from "@/feature/marketing/components/MarketingOverview";
import { MarketingTabs } from "@/feature/marketing/components/MarketingTabs";
import type { MarketingTabKey } from "@/feature/marketing/components/MarketingTabs";
import { MarketingShopBreakdown } from "@/feature/marketing/components/MarketingShopBreakdown";
import { MarketingNewCustomer } from "@/feature/marketing/components/MarketingNewCustomer";
import { CatchmentMapWrapper } from "@/feature/catchment/components/CatchmentMapWrapper";
import { MetaAdsTab } from "@/feature/meta-ads/components/MetaAdsTab";
import { MetaAnalysisTab } from "@/feature/meta-ads/components/MetaAnalysisTab";
import { AiAnalysisTab } from "@/feature/ai-analysis/components/AiAnalysisTab";
import { getMetaAdsSummary } from "@/feature/meta-ads/services/getMetaAdsSummary";
import { getMarketingData } from "@/feature/marketing/services/getMarketingData";
import { getMarketingByShop } from "@/feature/marketing/services/getMarketingByShop";
import { getNewCustomerAnalytics } from "@/feature/marketing/services/getNewCustomerAnalytics";
import { getCatchmentCustomers } from "@/feature/catchment/services/getCatchmentCustomers";
import { getLineFriendStats } from "@/feature/marketing/services/getLineFriendStats";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";
import { getStaffs } from "@/feature/staff/services/getStaffs";

export const dynamic = "force-dynamic";

interface MarketingPageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
    source?: string;
    staff?: string;
    tab?: string;
  }>;
}

function currentYearMonth(): string {
  const d = new Date().toLocaleString("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  const m = /(\d{4})-(\d{2})/.exec(d);
  if (m) return `${m[1]}-${m[2]}`;
  return new Date().toISOString().slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const base = y * 12 + (m - 1) + delta;
  const ny = Math.floor(base / 12);
  const nm = (base % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function monthOptions(): string[] {
  const now = currentYearMonth();
  const out: string[] = [];
  for (let i = -18; i <= 1; i += 1) out.push(addMonths(now, i));
  return out;
}

const VALID_TABS = new Set<MarketingTabKey>([
  "overview",
  "shop",
  "new-customer",
  "meta-ads",
  "meta-analysis",
  "catchment",
  "ai",
  "market",
]);

export default async function MarketingPage({
  searchParams,
}: MarketingPageProps) {
  const sp = await searchParams;
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // Default range: 当月のみ (ユーザー要望: 常に「今の月」が起点)。
  // 月次集計なので endMonth も当月にして、結果は 4/1〜月末までの
  // データ (未来の日付は実際には appointment / ad_spend が無いので
  // 自然と「4/1〜今日」相当の集計になる)。
  const now = currentYearMonth();
  const defaultStart = now;
  const defaultEnd = now;

  let startMonth = sp.start ?? defaultStart;
  let endMonth = sp.end ?? defaultEnd;
  // 防御: start が end より後なら swap して逆転入力で 0 件にしない。
  if (startMonth.localeCompare(endMonth) > 0) {
    [startMonth, endMonth] = [endMonth, startMonth];
  }
  const visitSourceId = sp.source ? Number(sp.source) : null;
  const staffId = sp.staff ? Number(sp.staff) : null;
  const rawTab = (sp.tab ?? "overview") as MarketingTabKey;
  const tab: MarketingTabKey = VALID_TABS.has(rawTab) ? rawTab : "overview";

  // Always load filter lookups (cheap) so the filter bar is populated.
  const supabase = await createClient();
  const [sourcesRes, staffs] = await Promise.all([
    supabase
      .from("visit_sources")
      .select("id, name")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
    getStaffs(shopId).catch(() => [] as Array<{ id: number; name: string }>),
  ]);
  const visitSources = (sourcesRes.data ?? []).map((s) => ({
    id: s.id as number,
    name: s.name as string,
  }));
  const staffOptions = (staffs as Array<{ id: number; name: string }>).map(
    (s) => ({ id: s.id, name: s.name })
  );

  // Fetch only the data the active tab actually needs.
  const tabContent = await (async () => {
    if (tab === "shop") {
      const { shops, grandTotal } = await getMarketingByShop({
        brandId,
        startMonth,
        endMonth,
        visitSourceId,
        staffId,
      });
      return <MarketingShopBreakdown shops={shops} grandTotal={grandTotal} />;
    }
    if (tab === "new-customer") {
      // 新規管理タブは単月ビュー。?start= をそのまま対象月として使う。
      // ?end / ?source / ?staff は現状無視 (月内すべての新規客を列挙)。
      const data = await getNewCustomerAnalytics({
        shopId,
        yearMonth: startMonth,
      });
      return <MarketingNewCustomer data={data} />;
    }
    if (tab === "meta-ads" || tab === "meta-analysis") {
      // 期間を Asia/Tokyo の YYYY-MM-DD に揃える。startMonth は YYYY-MM
      // なのでその月の 1 日 〜 endMonth の月末。
      const [sy, sm] = startMonth.split("-").map(Number);
      const [ey, em] = endMonth.split("-").map(Number);
      const startDate = `${startMonth}-01`;
      const endDate = (() => {
        const lastDay = new Date(ey, em, 0).getDate();
        return `${endMonth}-${String(lastDay).padStart(2, "0")}`;
      })();
      void sy;
      void sm; // 一応 lint 対策。startMonth はそのまま使うので未使用警告だけ抑える。
      const summary = await getMetaAdsSummary({ shopId, startDate, endDate });
      if (tab === "meta-ads") {
        return (
          <MetaAdsTab
            data={summary}
            startDate={startDate}
            endDate={endDate}
          />
        );
      }
      // メタ分析: appointments を visit_source = メタ で集計
      const metaAccount = await supabase
        .from("meta_ad_accounts")
        .select("visit_source_id")
        .eq("shop_id", shopId)
        .is("deleted_at", null)
        .maybeSingle();
      const metaSourceId = metaAccount.data?.visit_source_id as
        | number
        | null
        | undefined;
      const apptRes = await supabase
        .from("appointments")
        .select("status, sales, visit_source_id, last_visit_date")
        .eq("shop_id", shopId)
        .gte("start_at", `${startDate}T00:00:00+09:00`)
        .lt("start_at", `${endDate}T23:59:59+09:00`)
        .is("deleted_at", null);
      type ApptRow = {
        status: number;
        sales: number | null;
        visit_source_id: number | null;
      };
      const allRows = (apptRes.data ?? []) as ApptRow[];
      const isVisited = (s: number) => s === 1 || s === 2;
      const sumSales = (rs: ApptRow[]) =>
        rs
          .filter((r) => r.status === 2)
          .reduce((s, r) => s + (r.sales ?? 0), 0);
      const meta = metaSourceId
        ? allRows.filter((r) => r.visit_source_id === metaSourceId)
        : [];
      const metaApptStats = {
        bookings: meta.length,
        visits: meta.filter((r) => isVisited(r.status)).length,
        sales: sumSales(meta),
      };
      const allStats = {
        bookings: allRows.length,
        visits: allRows.filter((r) => isVisited(r.status)).length,
        sales: sumSales(allRows),
      };
      return (
        <MetaAnalysisTab
          startDate={startDate}
          endDate={endDate}
          metaTotals={summary.totals}
          metaAppointments={metaApptStats}
          allMedia={allStats}
        />
      );
    }
    if (tab === "ai") {
      return (
        <AiAnalysisTab startMonth={startMonth} endMonth={endMonth} />
      );
    }
    if (tab === "catchment") {
      // 商圏タブ: 顧客住所 geocode → 地図ピン表示。
      // 期間フィルタはクライアント側で行うので、サーバは全顧客を返す。
      const [catchmentData, sourcesForMap] = await Promise.all([
        // 上部フィルタの期間 (= startMonth/endMonth) を渡して、
        // ピンを「初回来院月が範囲内の顧客」だけに絞る。3 月指定なら
        // 3 月初来院の客だけ表示される。
        getCatchmentCustomers({ shopId, startMonth, endMonth }),
        (async () => {
          // 商圏マップは visit_sources.color (= 予約バッジと同じ色) を
          // ピンに反映させたいので、ここで color も取得する。
          const sRes = await supabase
            .from("visit_sources")
            .select("id, name, color")
            .eq("shop_id", shopId)
            .is("deleted_at", null)
            .order("sort_number", { ascending: true, nullsFirst: false });
          return (sRes.data ?? []).map((s) => ({
            id: s.id as number,
            name: s.name as string,
            color: (s.color as string | null) ?? null,
          }));
        })(),
      ]);
      return (
        <CatchmentMapWrapper
          data={catchmentData}
          visitSources={sourcesForMap}
          shopId={shopId}
        />
      );
    }
    // overview: default fallback. 媒体別 section is rendered within
    // MarketingOverview itself.
    const [data, lineFriendStats] = await Promise.all([
      getMarketingData({
        brandId,
        shopId,
        startMonth,
        endMonth,
        visitSourceId,
        staffId,
      }),
      // LINE 友だち化率は全顧客ベースの現在値 (期間フィルタを適用すると
      // 分母が揺れて意味が取りにくくなるため)
      getLineFriendStats(shopId).catch(() => undefined),
    ]);
    return (
      <MarketingOverview
        data={data}
        lineFriendStats={lineFriendStats}
      />
    );
  })();

  const descriptionBits: string[] = [];
  if (staffId) {
    const s = staffOptions.find((s) => s.id === staffId);
    if (s) descriptionBits.push(`担当: ${s.name}`);
  }
  if (visitSourceId) {
    const v = visitSources.find((v) => v.id === visitSourceId);
    if (v) descriptionBits.push(`媒体: ${v.name}`);
  }
  const description =
    tab === "new-customer"
      ? `当月の新規客台帳 (${startMonth.replace("-", "年")}月 起点の来店ベース集計)`
      : descriptionBits.length > 0
        ? `媒体 × 店舗 × 月で集計 (${descriptionBits.join(" / ")})`
        : "媒体 × 店舗 × 月で予約・来院・入会・キャンセル・広告費・売上を集計します";

  return (
    <div>
      <PageHeader title="マーケティング" description={description} />
      <div className="space-y-4 p-6">
        <MarketingFilters
          startMonth={startMonth}
          endMonth={endMonth}
          visitSourceId={visitSourceId}
          staffId={staffId}
          visitSources={visitSources}
          staffs={staffOptions}
          monthOptions={monthOptions()}
        />
        <MarketingTabs active={tab} />
        {tabContent}
      </div>
    </div>
  );
}
