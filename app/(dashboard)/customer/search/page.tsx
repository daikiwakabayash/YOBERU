import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerSearch } from "@/feature/customer/components/CustomerSearch";
import { getActiveShopId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function CustomerSearchPage() {
  const shopId = await getActiveShopId();
  return (
    <div>
      <PageHeader title="顧客検索" description="顧客を検索します" />
      <div className="p-6">
        <div className="mx-auto max-w-xl">
          <CustomerSearch shopId={shopId} mode="page" />
        </div>
      </div>
    </div>
  );
}
