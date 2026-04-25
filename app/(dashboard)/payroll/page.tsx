import Link from "next/link";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { getStaffMonthlyPayrollForShop } from "@/feature/payroll/services/getStaffMonthlyPayroll";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollTable } from "@/feature/payroll/components/PayrollTable";
import { Button } from "@/components/ui/button";
import { Settings, Mail } from "lucide-react";
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
  const rows = await getStaffMonthlyPayrollForShop({
    shopId,
    brandId,
    yearMonth,
  });

  return (
    <div>
      <PageHeader
        title="給与計算"
        description={`${yearMonth} 月の業務委託費 + 諸手当を表示します (Phase 2)`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/payroll/settings">
              <Button variant="outline" size="sm">
                <Mail className="mr-1 h-4 w-4" />
                メール設定
              </Button>
            </Link>
            <Link href="/payroll/tiers">
              <Button variant="outline" size="sm">
                <Settings className="mr-1 h-4 w-4" />
                業務委託費テーブル編集
              </Button>
            </Link>
          </div>
        }
      />
      <div className="p-6">
        <PayrollTable rows={rows} yearMonth={yearMonth} />
      </div>
    </div>
  );
}
