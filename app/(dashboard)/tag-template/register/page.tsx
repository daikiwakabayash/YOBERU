import { PageHeader } from "@/components/layout/PageHeader";
import { TagTemplateForm } from "@/feature/tag-template/components/TagTemplateForm";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function TagTemplateRegisterPage() {
  const brandId = await getActiveBrandId();
  return (
    <div>
      <PageHeader
        title="タグテンプレート作成"
        description="新しいタグテンプレートを作成"
      />
      <div className="p-6">
        <TagTemplateForm brandId={brandId} />
      </div>
    </div>
  );
}
