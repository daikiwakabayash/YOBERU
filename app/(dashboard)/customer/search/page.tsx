import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerSearch } from "@/feature/customer/components/CustomerSearch";

// TODO: shopId should come from session/context. Using 1 as placeholder.
const SHOP_ID = 1;

export default function CustomerSearchPage() {
  return (
    <div>
      <PageHeader title="顧客検索" description="顧客を検索します" />
      <div className="p-6">
        <div className="mx-auto max-w-xl">
          <CustomerSearch shopId={SHOP_ID} mode="page" />
        </div>
      </div>
    </div>
  );
}
