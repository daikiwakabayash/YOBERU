import { PageHeader } from "@/components/layout/PageHeader";
import { MenuForm } from "@/feature/menu/components/MenuForm";
import { getMenuCategories } from "@/feature/menu/services/getMenus";

export default async function MenuRegisterPage() {
  // TODO: brandId should come from the authenticated user's session
  const brandId = 1;

  const categories = await getMenuCategories(brandId);
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <PageHeader title="メニュー登録" />
      <div className="p-6">
        <MenuForm brandId={brandId} categories={categoryOptions} />
      </div>
    </div>
  );
}
