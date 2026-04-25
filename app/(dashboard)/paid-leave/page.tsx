import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getPaidLeaveSummary } from "@/feature/paid-leave/services/getPaidLeaveSummary";
import { PaidLeaveCard } from "@/feature/paid-leave/components/PaidLeaveCard";

export const dynamic = "force-dynamic";

export default async function PaidLeavePage() {
  const shopId = await getActiveShopId();
  const summaries = await getPaidLeaveSummary({ shopId });

  return (
    <div>
      <PageHeader
        title="有給休暇"
        description="単位は 1 日 / 半休 (午前 or 午後) の 2 種類。法定付与日数は入社日から自動算出されます。"
      />
      <div className="space-y-4 p-6">
        {summaries.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-gray-500">
              この店舗にはまだスタッフが登録されていません。
            </CardContent>
          </Card>
        ) : (
          summaries.map((s) => <PaidLeaveCard key={s.staffId} summary={s} />)
        )}
      </div>
    </div>
  );
}
