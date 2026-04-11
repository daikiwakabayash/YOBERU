import { PageHeader } from "@/components/layout/PageHeader";
import { AdSpendForm } from "@/feature/marketing/components/AdSpendForm";
import { getAdSpendRows } from "@/feature/marketing/services/getAdSpend";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";
import { AlertTriangle } from "lucide-react";

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
  const [adSpendResult, sourcesRes, shopRes] = await Promise.all([
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
      <div className="space-y-4 p-6">
        {adSpendResult.setupRequired && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <div className="font-bold">
                広告費テーブル (ad_spend) がまだ作成されていません
              </div>
              <p className="mt-1 leading-relaxed">
                Supabase のダッシュボードまたは CLI で
                <code className="mx-1 rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  supabase/migrations/00007_marketing_and_member_plans.sql
                </code>
                を実行してください。これで{" "}
                <code className="mx-1 rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  ad_spend
                </code>{" "}
                テーブル / appointments.is_member_join カラム / 会員プラン
                seed が一括で作成されます。
              </p>
              <p className="mt-2 text-xs text-amber-700">
                マイグレーション実行後、このページをリロードすると入力が
                可能になります。
              </p>
            </div>
          </div>
        )}
        <AdSpendForm
          brandId={brandId}
          shopId={shopId}
          shopName={shopName}
          visitSources={visitSources}
          rows={adSpendResult.rows}
          monthOptions={monthOptions()}
          disabled={adSpendResult.setupRequired}
        />
      </div>
    </div>
  );
}
