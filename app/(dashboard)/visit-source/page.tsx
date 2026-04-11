import { PageHeader } from "@/components/layout/PageHeader";
import { VisitSourceList } from "@/feature/visit-source/components/VisitSourceList";
import { createClient } from "@/helper/lib/supabase/server";
import type { VisitSource } from "@/feature/visit-source/types";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function VisitSourcePage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();
  const supabase = await createClient();

  let sources: VisitSource[] = [];
  try {
    const { data } = await supabase
      .from("visit_sources")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("sort_number");
    sources = (data ?? []) as VisitSource[];
  } catch {
    // Column / table may not yet be migrated
  }

  return (
    <div>
      <PageHeader
        title="来店経路マスター"
        description="予約カードの新規バッジ色と表示名を管理します"
      />
      <div className="p-6">
        <VisitSourceList
          sources={sources}
          brandId={brandId}
          shopId={shopId}
        />
      </div>
    </div>
  );
}
