import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerForm } from "@/feature/customer/components/CustomerForm";
import { getStaffs } from "@/feature/staff/services/getStaffs";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function CustomerRegisterPage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  let staffs: { id: number; name: string }[] = [];
  try {
    const staffData = await getStaffs(shopId);
    staffs = staffData.map((s: { id: number; name: string }) => ({
      id: s.id,
      name: s.name,
    }));
  } catch {
    // If fetching fails, show form with empty staff list
  }

  return (
    <div>
      <PageHeader title="顧客登録" description="新しい顧客を登録します" />
      <div className="p-6">
        <CustomerForm
          brandId={brandId}
          shopId={shopId}
          staffs={staffs}
        />
      </div>
    </div>
  );
}
