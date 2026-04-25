import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { getCompensationTiers } from "@/feature/payroll/services/getCompensationTiers";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CompensationTiersEditor } from "@/feature/payroll/components/CompensationTiersEditor";

export const dynamic = "force-dynamic";

export default async function CompensationTiersPage() {
  const brandId = await getActiveBrandId();
  const tiers = await getCompensationTiers(brandId);

  return (
    <div>
      <PageHeader
        title="業務委託費テーブル編集"
        description="売上 (税抜) の閾値ごとに適用される % を設定します。Phase 1: 報酬計算は max(最低保証額, 売上(税抜) × %) で求められます。"
        actions={
          <Link href="/payroll">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              給与計算へ戻る
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <CompensationTiersEditor brandId={brandId} initialTiers={tiers} />
      </div>
    </div>
  );
}
