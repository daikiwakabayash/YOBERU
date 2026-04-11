import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationRegisterForm } from "@/feature/reservation/components/ReservationRegisterForm";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function ReservationRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ staffId?: string; date?: string; time?: string }>;
}) {
  const params = await searchParams;
  const brandId = await getActiveBrandId();
  const shopId = await getActiveShopId();

  return (
    <div>
      <PageHeader
        title="予約登録"
        actions={
          <Link href="/reservation">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              予約表に戻る
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl p-6">
        <ReservationRegisterForm
          brandId={brandId}
          shopId={shopId}
          frameMin={15}
          menus={[]}
          initialStaffId={params.staffId ? Number(params.staffId) : undefined}
          initialDate={params.date}
          initialTime={params.time}
        />
      </div>
    </div>
  );
}
