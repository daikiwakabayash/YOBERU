import { PageHeader } from "@/components/layout/PageHeader";
import { ShiftPatternManager } from "@/feature/shift/components/ShiftPatternManager";
import { getWorkPatterns } from "@/feature/shift/services/getWorkPatterns";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function ShiftPatternListPage() {
  const brandId = await getActiveBrandId();
  const shopId = await getActiveShopId();

  let patterns: Awaited<ReturnType<typeof getWorkPatterns>> = [];
  try {
    patterns = await getWorkPatterns(shopId);
  } catch {
    // Swallow fetch errors so the form still renders
  }

  return (
    <div>
      <PageHeader
        title="出勤パターン一覧"
        description="スタッフの出勤パターン（早番・遅番など）を管理"
      />
      <div className="p-6">
        <ShiftPatternManager
          patterns={patterns}
          brandId={brandId}
          shopId={shopId}
        />
      </div>
    </div>
  );
}
