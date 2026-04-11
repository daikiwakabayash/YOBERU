import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { StaffList } from "@/feature/staff/components/StaffList";
import { getStaffs } from "@/feature/staff/services/getStaffs";
import { Plus } from "lucide-react";
import { getActiveShopId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function StaffListPage() {
  const shopId = await getActiveShopId();
  let staffs: Awaited<ReturnType<typeof getStaffs>> = [];
  try {
    staffs = await getStaffs(shopId);
  } catch {
    // If fetching fails (e.g., no shop selected), show empty list
  }

  return (
    <div>
      <PageHeader
        title="スタッフ一覧"
        description="スタッフの管理を行います"
        actions={
          <Link href="/staff/register">
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              新規登録
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <StaffList staffs={staffs} />
      </div>
    </div>
  );
}
