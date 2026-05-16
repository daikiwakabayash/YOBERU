import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CustomerList } from "@/feature/customer/components/CustomerList";
import { getCustomers } from "@/feature/customer/services/getCustomers";
import { Plus, Upload } from "lucide-react";
import type { Customer } from "@/feature/customer/types";
import { getActiveShopId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

interface CustomerListPageProps {
  searchParams: Promise<{ search?: string; type?: string }>;
}

export default async function CustomerListPage({ searchParams }: CustomerListPageProps) {
  const shopId = await getActiveShopId();
  const params = await searchParams;
  let customers: Customer[] = [];
  let totalCount = 0;

  try {
    // ページングは廃止。全件を一気に取得して縦スクロールで見せる。
    const result = await getCustomers(shopId, {
      search: params.search,
      type: params.type !== undefined ? Number(params.type) : undefined,
    });
    customers = result.data;
    totalCount = result.totalCount;
  } catch {
    // If fetching fails, show empty list
  }

  return (
    <div>
      <PageHeader
        title="顧客一覧"
        description="顧客の管理を行います"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/customer/import">
              <Button variant="outline">
                <Upload className="mr-1 h-4 w-4" />
                CSV インポート
              </Button>
            </Link>
            <Link href="/customer/register">
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                新規登録
              </Button>
            </Link>
          </div>
        }
      />
      <div className="p-3 sm:p-6">
        <CustomerList customers={customers} totalCount={totalCount} />
      </div>
    </div>
  );
}
