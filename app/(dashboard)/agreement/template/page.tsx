import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveTemplateWithDiagnostic } from "@/feature/agreement/services/getAgreement";
import { AgreementTemplateEditor } from "@/feature/agreement/components/AgreementTemplateEditor";
import { AgreementTopTabs } from "@/feature/agreement/components/AgreementTopTabs";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import type { AgreementKind } from "@/feature/agreement/types";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const KIND_TABS: { key: AgreementKind; label: string; available: boolean }[] = [
  { key: "membership", label: "会員申込書", available: true },
  { key: "receipt", label: "領収書", available: true },
];

export default async function AgreementTemplatePage({ searchParams }: Props) {
  const { kind } = await searchParams;
  const activeKind: AgreementKind =
    kind === "receipt" || kind === "consent" ? kind : "membership";

  const brandId = await getActiveBrandId();
  const { template, diagnostic } = await getActiveTemplateWithDiagnostic({
    brandId,
    kind: activeKind,
    ensureCreate: activeKind === "membership" || activeKind === "receipt",
  });

  return (
    <div>
      <PageHeader
        title="同意書テンプレート"
        description="顧客に送る同意書の本文と確認項目を編集します"
      />
      <div className="space-y-4 p-3 sm:p-6">
        <AgreementTopTabs />

        {/* kind タブ */}
        <div className="flex flex-wrap gap-2">
          {KIND_TABS.map((t) => {
            const isActive = activeKind === t.key;
            const href =
              t.key === "membership"
                ? "/agreement/template"
                : `/agreement/template?kind=${t.key}`;
            return (
              <a
                key={t.key}
                href={t.available ? href : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : t.available
                      ? "bg-white text-gray-600 hover:bg-gray-50 border"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed border"
                }`}
              >
                {t.label}
              </a>
            );
          })}
        </div>

        {!template ? (
          <Card>
            <CardContent className="space-y-2 p-6 text-sm text-rose-700">
              <p className="font-bold">テンプレートが取得できません</p>
              {diagnostic && (
                <p className="text-xs text-rose-600">原因: {diagnostic}</p>
              )}
              <p className="text-xs text-gray-600">
                migration 00042_agreements.sql を Supabase SQL Editor で実行し、
                <code className="mx-1 rounded bg-gray-100 px-1">
                  ALTER TABLE agreement_templates DISABLE ROW LEVEL SECURITY;
                </code>
                を併せて実行してください。
              </p>
            </CardContent>
          </Card>
        ) : (
          <AgreementTemplateEditor template={template} />
        )}
      </div>
    </div>
  );
}
