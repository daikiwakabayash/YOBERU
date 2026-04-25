import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { getPayrollEmailTemplate } from "@/feature/payroll/services/getPayrollEmailTemplate";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { PayrollEmailTemplateForm } from "@/feature/payroll/components/PayrollEmailTemplateForm";

export const dynamic = "force-dynamic";

export default async function PayrollSettingsPage() {
  const brandId = await getActiveBrandId();
  const tmpl = await getPayrollEmailTemplate(brandId);

  return (
    <div>
      <PageHeader
        title="給与メール設定"
        description="請求書メールの件名 / 本文テンプレートをブランド単位で編集します。スタッフごとの送信先メール (payroll_email) はスタッフ管理画面から設定できます。"
        actions={
          <Link href="/payroll">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              給与計算へ戻る
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <PayrollEmailTemplateForm
          brandId={brandId}
          initialSubject={tmpl.subjectTemplate}
          initialBody={tmpl.bodyTemplate}
        />
      </div>
    </div>
  );
}
