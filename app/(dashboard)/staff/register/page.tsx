import { PageHeader } from "@/components/layout/PageHeader";
import { StaffForm } from "@/feature/staff/components/StaffForm";
import { getWorkPatterns } from "@/feature/staff/services/getWorkPatterns";

// TODO: brandId/shopId should come from session/context. Using placeholders.
const BRAND_ID = 1;
const SHOP_ID = 1;

export default async function StaffRegisterPage() {
  let workPatterns: Awaited<ReturnType<typeof getWorkPatterns>> = [];
  try {
    workPatterns = await getWorkPatterns(SHOP_ID);
  } catch {
    // If fetching fails, show form with empty patterns
  }

  return (
    <div>
      <PageHeader title="スタッフ登録" description="新しいスタッフを登録します" />
      <div className="p-6">
        <StaffForm
          brandId={BRAND_ID}
          shopId={SHOP_ID}
          workPatterns={workPatterns}
        />
      </div>
    </div>
  );
}
