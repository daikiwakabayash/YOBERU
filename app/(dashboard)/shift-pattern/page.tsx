import { PageHeader } from "@/components/layout/PageHeader";
import { WorkPatternList } from "@/feature/shift/components/WorkPatternList";
import { WorkPatternForm } from "@/feature/shift/components/WorkPatternForm";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <WorkPatternList patterns={patterns} />
            </CardContent>
          </Card>
        </div>
        <div>
          <WorkPatternForm brandId={brandId} shopId={shopId} />
        </div>
      </div>
    </div>
  );
}
