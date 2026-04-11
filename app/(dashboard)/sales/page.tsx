import { PageHeader } from "@/components/layout/PageHeader";
import { SalesDashboardContent } from "@/feature/sales/components/SalesDashboardContent";
import { SalesFilters } from "@/feature/sales/components/SalesFilters";
import { getSalesSummary } from "@/feature/sales/services/getSales";
import { getStaffs } from "@/feature/staff/services/getStaffs";
import { toLocalDateString } from "@/helper/utils/time";
import { getActiveShopId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function SalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; staff?: string }>;
}) {
  const shopId = await getActiveShopId();
  const params = await searchParams;
  const today = toLocalDateString(new Date());
  const startDate = params.start || today;
  const endDate = params.end || today;
  const staffId = params.staff ? Number(params.staff) : null;

  const [data, staffs] = await Promise.all([
    getSalesSummary(shopId, startDate, endDate, staffId).catch(() => ({
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
    })),
    getStaffs(shopId).catch(() => [] as Array<{ id: number; name: string }>),
  ]);

  const staffOptions = (staffs as Array<{ id: number; name: string }>).map(
    (s) => ({ id: s.id, name: s.name })
  );

  const dateRange =
    startDate === endDate ? startDate : `${startDate} 〜 ${endDate}`;

  const activeStaffName = staffId
    ? staffOptions.find((s) => s.id === staffId)?.name ?? `staff #${staffId}`
    : null;

  return (
    <div>
      <PageHeader
        title="売上ダッシュボード"
        description={
          activeStaffName ? `${dateRange} / ${activeStaffName}` : dateRange
        }
      />
      <div className="space-y-4 p-6">
        <SalesFilters
          startDate={startDate}
          endDate={endDate}
          staffId={staffId}
          staffs={staffOptions}
        />
        <SalesDashboardContent data={data} dateRange={dateRange} />
      </div>
    </div>
  );
}
