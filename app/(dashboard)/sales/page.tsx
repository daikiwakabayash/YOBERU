import { PageHeader } from "@/components/layout/PageHeader";
import { SalesDashboardContent } from "@/feature/sales/components/SalesDashboardContent";
import { SalesFilters } from "@/feature/sales/components/SalesFilters";
import { DailyReportTable } from "@/feature/sales/components/DailyReportTable";
import { getSalesSummary } from "@/feature/sales/services/getSales";
import { getDailyReport } from "@/feature/sales/services/getDailyReport";
import { getStaffReviewCounts } from "@/feature/sales/services/getStaffReviewCounts";
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
  // Default range = the current month so the daily report shows multiple
  // rows out of the box. Filter narrows it down.
  const defaultStart = `${today.slice(0, 7)}-01`;
  const startDate = params.start || defaultStart;
  const endDate = params.end || today;
  const staffId = params.staff ? Number(params.staff) : null;

  // 期間 startDate の月を「口コミカウントの対象月」として使用する。
  // (期間が複数月にまたがる場合でも、UI には開始月の数字を出す。
  //  通常はサロン運用上 当月単位で見るので問題ない。)
  const yearMonth = startDate.slice(0, 7);

  const [data, daily, staffs, reviewCounts] = await Promise.all([
    getSalesSummary(shopId, startDate, endDate, staffId).catch(() => ({
      totalSales: 0,
      totalCount: 0,
      newCustomerSales: 0,
      newCustomerCount: 0,
      existingCustomerSales: 0,
      existingCustomerCount: 0,
      consumedSales: 0,
      consumedCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
      staffSales: [],
    })),
    // Daily report intentionally ignores the staff filter — payment /
    // source breakdowns are 店舗単位 per the spec.
    getDailyReport(shopId, startDate, endDate).catch(() => null),
    getStaffs(shopId).catch(() => [] as Array<{ id: number; name: string }>),
    getStaffReviewCounts(shopId, yearMonth).catch(
      () => new Map<number, { staffId: number; googleCount: number; hotpepperCount: number }>()
    ),
  ]);

  // staffSales に G口コミ / H口コミ を流し込む (テーブルが無い環境でも 0)
  data.staffSales = data.staffSales.map((s) => {
    const r = reviewCounts.get(s.staffId);
    return {
      ...s,
      googleReviewCount: r?.googleCount ?? 0,
      hotpepperReviewCount: r?.hotpepperCount ?? 0,
    };
  });

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
        <SalesDashboardContent
          data={data}
          dateRange={dateRange}
          yearMonth={yearMonth}
        />
        {daily && <DailyReportTable data={daily} />}
      </div>
    </div>
  );
}
