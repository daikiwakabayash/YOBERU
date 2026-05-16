import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { CustomerImportForm } from "@/feature/customer/components/CustomerImportForm";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CustomerImportPage() {
  const shopId = await getActiveShopId();
  let shopName: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("shops")
      .select("name")
      .eq("id", shopId)
      .maybeSingle();
    shopName = (data?.name as string | undefined) ?? null;
  } catch {
    shopName = null;
  }

  return (
    <div>
      <PageHeader
        title="顧客 CSV インポート"
        description="CSV ファイルから顧客を一括登録します"
        actions={
          <Link href="/customer">
            <Button variant="outline">
              <ChevronLeft className="mr-1 h-4 w-4" />
              顧客一覧へ戻る
            </Button>
          </Link>
        }
      />
      <div className="p-3 sm:p-6">
        <CustomerImportForm shopId={shopId} shopName={shopName} />
      </div>
    </div>
  );
}
