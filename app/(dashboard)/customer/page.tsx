import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CustomerList } from "@/feature/customer/components/CustomerList";
import { getCustomers } from "@/feature/customer/services/getCustomers";
import { Plus } from "lucide-react";
import type { Customer } from "@/feature/customer/types";

// TODO: shopId should come from session/context. Using 1 as placeholder.
const SHOP_ID = 1;

interface CustomerListPageProps {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>;
}

export default async function CustomerListPage({ searchParams }: CustomerListPageProps) {
  const params = await searchParams;
  let customers: Customer[] = [];
  let totalCount = 0;

  try {
    const result = await getCustomers(SHOP_ID, {
      search: params.search,
      type: params.type !== undefined ? Number(params.type) : undefined,
      page: params.page ? Number(params.page) : 1,
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
          <Link href="/customer/register">
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              新規登録
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <CustomerList customers={customers} totalCount={totalCount} />
      </div>
    </div>
  );
}
