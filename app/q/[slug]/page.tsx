import { notFound } from "next/navigation";
import { getQuestionnaireBySlug } from "@/feature/questionnaire/services/getQuestionnaires";
import { PublicQuestionnaireForm } from "@/feature/questionnaire/components/PublicQuestionnaireForm";

export const dynamic = "force-dynamic";

interface PublicQuestionnairePageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicQuestionnairePage({
  params,
}: PublicQuestionnairePageProps) {
  const { slug } = await params;
  const questionnaire = await getQuestionnaireBySlug(slug);
  if (!questionnaire) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 rounded-md border-l-4 border-pink-300 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">
            {questionnaire.title}
          </h1>
          {questionnaire.description && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">
              {questionnaire.description}
            </p>
          )}
        </div>

        <PublicQuestionnaireForm questionnaire={questionnaire} />
      </div>
    </div>
  );
}
