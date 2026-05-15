import { PageHeader } from "@/components/layout/PageHeader";
import { BrandList } from "@/feature/brand/components/BrandList";
import { getBrands, isCurrentUserRoot } from "@/feature/brand/services/getBrands";

export const dynamic = "force-dynamic";

export default async function BrandListPage() {
  const [brands, canCreate] = await Promise.all([
    getBrands(),
    isCurrentUserRoot(),
  ]);

  return (
    <div>
      <PageHeader
        title="ブランド管理"
        description="登録されているブランド (= 企業) の一覧と作成"
      />
      <div className="p-6">
        <BrandList brands={brands} canCreate={canCreate} />
      </div>
    </div>
  );
}
