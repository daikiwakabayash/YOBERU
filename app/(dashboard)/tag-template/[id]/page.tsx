import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { TagTemplateForm } from "@/feature/tag-template/components/TagTemplateForm";
import { getTagTemplateById } from "@/feature/tag-template/services/getTagTemplates";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

interface TagTemplateEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function TagTemplateEditPage({
  params,
}: TagTemplateEditPageProps) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) notFound();

  const brandId = await getActiveBrandId();
  const template = await getTagTemplateById(numId);
  if (!template) notFound();

  return (
    <div>
      <PageHeader title="タグテンプレート編集" description={template.title} />
      <div className="p-6">
        <TagTemplateForm brandId={brandId} initialData={template} />
      </div>
    </div>
  );
}
