import { PageHeader } from "@/components/layout/PageHeader";
import { MenuCategoryForm } from "@/feature/menu/components/MenuCategoryForm";
import { getMenuCategory } from "@/feature/menu/services/getMenus";

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function MenuCategoryRegisterPage({
  searchParams,
}: Props) {
  const params = await searchParams;
  const editId = params.id ? Number(params.id) : null;

  // TODO: brandId should come from the authenticated user's session
  const brandId = 1;

  let initialData: Parameters<typeof MenuCategoryForm>[0]["initialData"];

  if (editId) {
    const category = await getMenuCategory(editId);
    initialData = {
      id: category.id,
      brand_id: category.brand_id,
      shop_id: category.shop_id ?? null,
      name: category.name,
      sort_number: category.sort_number ?? 0,
    };
  }

  return (
    <div>
      <PageHeader
        title={editId ? "メニューカテゴリ編集" : "メニューカテゴリ登録"}
      />
      <div className="p-6">
        <MenuCategoryForm brandId={brandId} initialData={initialData} />
      </div>
    </div>
  );
}
