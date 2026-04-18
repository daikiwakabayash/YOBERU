import { PageHeader } from "@/components/layout/PageHeader";
import { MarketingFilters } from "@/feature/marketing/components/MarketingFilters";
import { MarketingOverview } from "@/feature/marketing/components/MarketingOverview";
import { MarketingTabs } from "@/feature/marketing/components/MarketingTabs";
import type { MarketingTabKey } from "@/feature/marketing/components/MarketingTabs";
import { MarketingShopBreakdown } from "@/feature/marketing/components/MarketingShopBreakdown";
import { MarketingMenuBreakdown } from "@/feature/marketing/components/MarketingMenuBreakdown";
import { MarketingNewCustomer } from "@/feature/marketing/components/MarketingNewCustomer";
import { getMarketingData } from "@/feature/marketing/services/getMarketingData";
import { getMarketingByShop } from "@/feature/marketing/services/getMarketingByShop";
import { getMarketingByMenu } from "@/feature/marketing/services/getMarketingByMenu";
import { getNewCustomerAnalytics } from "@/feature/marketing/services/getNewCustomerAnalytics";
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
  "media",
  "menu",
  "new-customer",
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
    if (tab === "menu") {
      const menus = await getMarketingByMenu({
        shopId,
        startMonth,
        endMonth,
        visitSourceId,
        staffId,
      });
      return <MarketingMenuBreakdown menus={menus} />;
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
    // overview + media share the same aggregation. Media view is the
    // same overview with media table highlighted at the top; for this
    // round we render the same MarketingOverview and let the 媒体別
    // section stand out visually within it.
    const data = await getMarketingData({
      brandId,
      shopId,
      startMonth,
      endMonth,
      visitSourceId,
      staffId,
    });
    return <MarketingOverview data={data} />;
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
