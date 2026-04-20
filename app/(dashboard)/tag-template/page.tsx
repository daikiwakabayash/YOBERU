import { PageHeader } from "@/components/layout/PageHeader";
import { TagTemplateList } from "@/feature/tag-template/components/TagTemplateList";
import { getTagTemplates } from "@/feature/tag-template/services/getTagTemplates";
import { SetupRequiredNotice } from "@/feature/booking-link/components/SetupRequiredNotice";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function TagTemplatePage() {
  const brandId = await getActiveBrandId();
  const { data, setupRequired } = await getTagTemplates(brandId);

  return (
    <div>
      <PageHeader
        title="タグテンプレート"
        description="Google タグマネージャー等のタグを再利用可能なテンプレートとして管理し、強制リンクに紐付けます"
      />
      <div className="p-6">
        {setupRequired ? (
          <SetupRequiredNotice />
        ) : (
          <TagTemplateList templates={data} />
        )}
      </div>
    </div>
  );
}
