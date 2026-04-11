import { PageHeader } from "@/components/layout/PageHeader";
import { AdSpendForm } from "@/feature/marketing/components/AdSpendForm";
import { getAdSpendRows } from "@/feature/marketing/services/getAdSpend";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";

export const dynamic = "force-dynamic";

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

export default async function AdSpendPage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  const supabase = await createClient();
  const [rows, sourcesRes, shopRes] = await Promise.all([
    getAdSpendRows(shopId),
    supabase
      .from("visit_sources")
      .select("id, name")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
    supabase.from("shops").select("name").eq("id", shopId).maybeSingle(),
  ]);

  const visitSources = (sourcesRes.data ?? []).map((s) => ({
    id: s.id as number,
    name: s.name as string,
  }));
  const shopName = (shopRes.data?.name as string | null) ?? null;

  return (
    <div>
      <PageHeader
        title="広告費"
        description="媒体 × 月で広告費を管理し、マーケティングダッシュボードの CPA / ROAS 計算に使用します"
      />
      <div className="p-6">
        <AdSpendForm
          brandId={brandId}
          shopId={shopId}
          shopName={shopName}
          visitSources={visitSources}
          rows={rows}
          monthOptions={monthOptions()}
        />
      </div>
    </div>
  );
}
