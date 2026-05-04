import { Card, CardContent } from "@/components/ui/card";
import { AgreementForm } from "@/feature/agreement/components/AgreementForm";
import { PrintTrigger } from "@/feature/agreement/components/PrintTrigger";
import { getAgreementByUuid } from "@/feature/agreement/services/getAgreement";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ print?: string }>;
}

export default async function AgreePage({ params, searchParams }: Props) {
  const { uuid } = await params;
  const { print } = await searchParams;
  const agreement = await getAgreementByUuid(uuid);
  const printMode = print === "1";

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
    <main
      className={`min-h-[100dvh] bg-gray-50 ${
        printMode ? "agreement-print-mode" : ""
      }`}
    >
      <AgreementForm agreement={agreement} />
      {printMode && <PrintTrigger />}
    </main>
  );
}
