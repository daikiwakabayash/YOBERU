import Link from "next/link";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { getStaffMonthlyCompensationForShop } from "@/feature/payroll/services/getStaffMonthlyCompensation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollTable } from "@/feature/payroll/components/PayrollTable";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { toLocalDateString } from "@/helper/utils/time";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ym?: string }>;
}

function defaultYearMonth(): string {
  // 当月 (Asia/Tokyo)
  const today = toLocalDateString(new Date()); // 'YYYY-MM-DD'
  return today.slice(0, 7);
}

export default async function PayrollPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : defaultYearMonth();

  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();
  const rows = await getStaffMonthlyCompensationForShop({
    shopId,
    brandId,
    yearMonth,
  });

  return (
    <div>
      <PageHeader
        title="給与計算"
        description={`${yearMonth} 月の業務委託費を表示します (Phase 1: 計算+表示のみ)`}
        actions={
          <Link href="/payroll/tiers">
            <Button variant="outline" size="sm">
              <Settings className="mr-1 h-4 w-4" />
              業務委託費テーブル編集
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <PayrollTable rows={rows} yearMonth={yearMonth} />
      </div>
    </div>
  );
}
