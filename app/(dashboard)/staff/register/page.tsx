import { PageHeader } from "@/components/layout/PageHeader";
import { StaffForm } from "@/feature/staff/components/StaffForm";
import { getWorkPatterns } from "@/feature/staff/services/getWorkPatterns";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function StaffRegisterPage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  let workPatterns: Awaited<ReturnType<typeof getWorkPatterns>> = [];
  try {
    workPatterns = await getWorkPatterns(shopId);
  } catch {
    // If fetching fails, show form with empty patterns
  }

  return (
    <div>
      <PageHeader title="スタッフ登録" description="新しいスタッフを登録します" />
      <div className="p-6">
        <StaffForm
          brandId={brandId}
          shopId={shopId}
          workPatterns={workPatterns}
        />
      </div>
    </div>
  );
}
