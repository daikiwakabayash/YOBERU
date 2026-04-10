import { PageHeader } from "@/components/layout/PageHeader";
import { SalesDashboardContent } from "@/feature/sales/components/SalesDashboardContent";
import { getSalesSummary } from "@/feature/sales/services/getSales";
import { toLocalDateString } from "@/helper/utils/time";

const SHOP_ID = 1;

export default async function SalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const params = await searchParams;
  const today = toLocalDateString(new Date());
  const startDate = params.start || today;
  const endDate = params.end || today;

  let data;
  try {
    data = await getSalesSummary(SHOP_ID, startDate, endDate);
  } catch {
    data = {
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
  }

  const dateRange =
    startDate === endDate ? startDate : `${startDate} 〜 ${endDate}`;

  return (
    <div>
      <PageHeader title="売上ダッシュボード" description={dateRange} />
      <div className="p-6">
        <SalesDashboardContent data={data} dateRange={dateRange} />
      </div>
    </div>
  );
}
