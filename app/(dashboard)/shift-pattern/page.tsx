import { PageHeader } from "@/components/layout/PageHeader";
import { WorkPatternList } from "@/feature/shift/components/WorkPatternList";
import { WorkPatternForm } from "@/feature/shift/components/WorkPatternForm";
import { Card, CardContent } from "@/components/ui/card";

export default function ShiftPatternListPage() {
  // TODO: Get brandId/shopId from session context
  const brandId = 1;
  const shopId = 1;

  return (
    <div>
      <PageHeader
        title="出勤パターン一覧"
        description="スタッフの出勤パターン（早番・遅番など）を管理"
      />
      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <WorkPatternList patterns={[]} />
            </CardContent>
          </Card>
        </div>
        <div>
          <WorkPatternForm brandId={brandId} shopId={shopId} />
        </div>
      </div>
    </div>
  );
}
