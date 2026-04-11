import { PageHeader } from "@/components/layout/PageHeader";
import { QuestionnaireForm } from "@/feature/questionnaire/components/QuestionnaireForm";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function QuestionnaireRegisterPage() {
  const brandId = await getActiveBrandId();
  const shopId = await getActiveShopId();
  return (
    <div>
      <PageHeader title="問診票作成" description="新しい問診票を作成" />
      <div className="p-6">
        <QuestionnaireForm brandId={brandId} shopId={shopId} />
      </div>
    </div>
  );
}
