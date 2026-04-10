import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuestionnaireForm } from "@/feature/questionnaire/components/QuestionnaireForm";
import { getQuestionnaireById } from "@/feature/questionnaire/services/getQuestionnaires";

const BRAND_ID = 1;
const SHOP_ID = 1;

export const dynamic = "force-dynamic";

interface QuestionnaireEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuestionnaireEditPage({
  params,
}: QuestionnaireEditPageProps) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) notFound();

  const questionnaire = await getQuestionnaireById(numId);
  if (!questionnaire) notFound();

  return (
    <div>
      <PageHeader
        title="問診票編集"
        description={questionnaire.title}
      />
      <div className="p-6">
        <QuestionnaireForm
          brandId={BRAND_ID}
          shopId={SHOP_ID}
          initialData={questionnaire}
        />
      </div>
    </div>
  );
}
