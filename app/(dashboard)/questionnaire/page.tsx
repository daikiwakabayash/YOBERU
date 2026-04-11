import { PageHeader } from "@/components/layout/PageHeader";
import { QuestionnaireList } from "@/feature/questionnaire/components/QuestionnaireList";
import { getQuestionnaires } from "@/feature/questionnaire/services/getQuestionnaires";
import { SetupRequiredNotice } from "@/feature/booking-link/components/SetupRequiredNotice";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function QuestionnairePage() {
  const brandId = await getActiveBrandId();
  const { data, setupRequired } = await getQuestionnaires(brandId);

  return (
    <div>
      <PageHeader
        title="問診票マスター"
        description="来院前に答えてもらう問診票を作成し、回答を顧客データに連動させます"
      />
      <div className="p-6">
        {setupRequired ? (
          <SetupRequiredNotice />
        ) : (
          <QuestionnaireList questionnaires={data} />
        )}
      </div>
    </div>
  );
}
