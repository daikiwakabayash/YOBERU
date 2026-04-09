import { PageHeader } from "@/components/layout/PageHeader";
import { SalesDashboardContent } from "@/feature/sales/components/SalesDashboardContent";

export default async function SalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().split("T")[0];
  const startDate = params.start || today;
  const endDate = params.end || today;

  // TODO: Fetch from Supabase via getSalesSummary(shopId, startDate, endDate)
  const emptyData = {
    totalSales: 0,
    totalCount: 0,
    newCustomerSales: 0,
    newCustomerCount: 0,
    existingCustomerSales: 0,
    existingCustomerCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    staffSales: [],
  };

  const dateRange =
    startDate === endDate
      ? startDate
      : `${startDate} 〜 ${endDate}`;

  return (
    <div>
      <PageHeader
        title="売上ダッシュボード"
        description={dateRange}
      />
      <div className="p-6">
        <SalesDashboardContent data={emptyData} dateRange={dateRange} />
      </div>
    </div>
  );
}
