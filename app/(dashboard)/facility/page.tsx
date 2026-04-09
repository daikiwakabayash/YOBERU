import { PageHeader } from "@/components/layout/PageHeader";
import { FacilityList } from "@/feature/facility/components/FacilityList";
import { FacilityForm } from "@/feature/facility/components/FacilityForm";
import { Card, CardContent } from "@/components/ui/card";

export default function FacilityListPage() {
  // TODO: Get brandId/shopId from session context
  const brandId = 1;
  const shopId = 1;

  return (
    <div>
      <PageHeader title="設備一覧" description="施術ベッド・部屋などの設備を管理" />
      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <FacilityList facilities={[]} />
            </CardContent>
          </Card>
        </div>
        <div>
          <FacilityForm brandId={brandId} shopId={shopId} />
        </div>
      </div>
    </div>
  );
}
