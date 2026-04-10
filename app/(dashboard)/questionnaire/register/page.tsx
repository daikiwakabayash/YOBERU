import { PageHeader } from "@/components/layout/PageHeader";
import { QuestionnaireForm } from "@/feature/questionnaire/components/QuestionnaireForm";

const BRAND_ID = 1;
const SHOP_ID = 1;

export default function QuestionnaireRegisterPage() {
  return (
    <div>
      <PageHeader title="問診票作成" description="新しい問診票を作成" />
      <div className="p-6">
        <QuestionnaireForm brandId={BRAND_ID} shopId={SHOP_ID} />
      </div>
    </div>
  );
}
