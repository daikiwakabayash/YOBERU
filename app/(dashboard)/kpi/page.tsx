import { PageHeader } from "@/components/layout/PageHeader";
import { SalesFilters } from "@/feature/sales/components/SalesFilters";
import { KpiDashboard } from "@/feature/kpi/components/KpiDashboard";
import { getKpiData } from "@/feature/kpi/services/getKpiData";
import { getStaffs } from "@/feature/staff/services/getStaffs";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { toLocalDateString } from "@/helper/utils/time";

export const dynamic = "force-dynamic";

function addDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toLocalDateString(d);
}

function firstOfMonth(): string {
  const today = toLocalDateString(new Date());
  return `${today.slice(0, 7)}-01`;
}

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; staff?: string }>;
}) {
  const sp = await searchParams;
  const shopId = await getActiveShopId();

  // Default: this month so far
  const defaultStart = firstOfMonth();
  const defaultEnd = toLocalDateString(new Date());
  const startDate = sp.start || defaultStart;
  const endDate = sp.end || defaultEnd;
  const staffId = sp.staff ? Number(sp.staff) : null;

  const [data, staffs] = await Promise.all([
    getKpiData({ shopId, startDate, endDate, staffId }),
    getStaffs(shopId).catch(() => [] as Array<{ id: number; name: string }>),
  ]);

  const staffOptions = (staffs as Array<{ id: number; name: string }>).map(
    (s) => ({ id: s.id, name: s.name })
  );
  const activeStaffName = staffId
    ? staffOptions.find((s) => s.id === staffId)?.name ?? `staff #${staffId}`
    : null;

  const description =
    startDate === endDate
      ? startDate
      : `${startDate} 〜 ${endDate}` +
        (activeStaffName ? ` / ${activeStaffName}` : "");

  return (
    <div>
      <PageHeader title="経営指標" description={description} />
      <div className="space-y-5 p-6">
        <SalesFilters
          startDate={startDate}
          endDate={endDate}
          staffId={staffId}
          staffs={staffOptions}
        />
        <KpiDashboard data={data} />
      </div>
    </div>
  );
}
