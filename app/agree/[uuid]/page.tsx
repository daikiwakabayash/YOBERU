import { Card, CardContent } from "@/components/ui/card";
import { AgreementForm } from "@/feature/agreement/components/AgreementForm";
import { getAgreementByUuid } from "@/feature/agreement/services/getAgreement";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ uuid: string }>;
}

export default async function AgreePage({ params }: Props) {
  const { uuid } = await params;
  const agreement = await getAgreementByUuid(uuid);

  if (!agreement || !agreement.template) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <h1 className="text-base font-bold">リンクが無効です</h1>
            <p className="text-xs text-gray-500">
              この同意書は存在しないか、削除されています。
              店舗までお問い合わせください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50">
      <AgreementForm agreement={agreement} />
    </main>
  );
}
