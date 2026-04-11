import { PageHeader } from "@/components/layout/PageHeader";
import { MarketingFilters } from "@/feature/marketing/components/MarketingFilters";
import { MarketingOverview } from "@/feature/marketing/components/MarketingOverview";
import { getMarketingData } from "@/feature/marketing/services/getMarketingData";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";

export const dynamic = "force-dynamic";

interface MarketingPageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
    source?: string;
  }>;
}

function currentYearMonth(): string {
  // Asia/Tokyo aligned via toLocaleString
  const d = new Date().toLocaleString("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  // "2026-04" format after normalizing
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
  // 18 past months + current month + 1 future month (for budgeting)
  for (let i = -18; i <= 1; i += 1) out.push(addMonths(now, i));
  return out;
}

export default async function MarketingPage({
  searchParams,
}: MarketingPageProps) {
  const sp = await searchParams;
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // Default range: last 6 months through current
  const now = currentYearMonth();
  const defaultStart = addMonths(now, -5);
  const defaultEnd = now;

  const startMonth = sp.start ?? defaultStart;
  const endMonth = sp.end ?? defaultEnd;
  const visitSourceId = sp.source ? Number(sp.source) : null;

  // Load visit sources (for the filter dropdown) in parallel with data.
  const supabase = await createClient();
  const [data, sourcesRes] = await Promise.all([
    getMarketingData({
      brandId,
      shopId,
      startMonth,
      endMonth,
      visitSourceId,
    }),
    supabase
      .from("visit_sources")
      .select("id, name")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
  ]);

  const visitSources =
    (sourcesRes.data ?? []).map((s) => ({
      id: s.id as number,
      name: s.name as string,
    })) ?? [];

  return (
    <div>
      <PageHeader
        title="マーケティング"
        description="媒体 × 店舗 × 月で予約・来院・入会・キャンセル・広告費・売上を集計します"
      />
      <div className="space-y-4 p-6">
        <MarketingFilters
          startMonth={startMonth}
          endMonth={endMonth}
          visitSourceId={visitSourceId}
          visitSources={visitSources}
          monthOptions={monthOptions()}
        />
        <MarketingOverview data={data} />
      </div>
    </div>
  );
}
