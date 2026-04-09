import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerForm } from "@/feature/customer/components/CustomerForm";
import { getStaffs } from "@/feature/staff/services/getStaffs";

// TODO: brandId/shopId should come from session/context. Using placeholders.
const BRAND_ID = 1;
const SHOP_ID = 1;

export default async function CustomerRegisterPage() {
  let staffs: { id: number; name: string }[] = [];
  try {
    const staffData = await getStaffs(SHOP_ID);
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
          brandId={BRAND_ID}
          shopId={SHOP_ID}
          staffs={staffs}
        />
      </div>
    </div>
  );
}
