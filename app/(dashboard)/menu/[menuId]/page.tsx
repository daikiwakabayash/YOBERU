import { PageHeader } from "@/components/layout/PageHeader";
import { MenuForm } from "@/feature/menu/components/MenuForm";
import { getMenu } from "@/feature/menu/services/getMenus";
import { getMenuCategories } from "@/feature/menu/services/getMenus";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ menuId: string }>;
}

export default async function MenuDetailPage({ params }: Props) {
  const { menuId } = await params;
  // TODO: brandId should come from the authenticated user's session
  const brandId = 1;

  let menu;
  try {
    menu = await getMenu(Number(menuId));
  } catch {
    notFound();
  }

  const categories = await getMenuCategories(brandId);
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  const initialData = {
    id: menu.id,
    brand_id: menu.brand_id,
    shop_id: menu.shop_id ?? null,
    category_id: menu.category_id,
    menu_type: menu.menu_type ?? 0,
    name: menu.name,
    price: menu.price ?? 0,
    price_disp_type: menu.price_disp_type ?? false,
    duration: menu.duration,
    image_url: menu.image_url ?? "",
    available_count: menu.available_count ?? undefined,
    status: menu.status ?? true,
    sort_number: menu.sort_number ?? 0,
    plan_type: (menu.plan_type ?? null) as "ticket" | "subscription" | null,
    ticket_count: menu.ticket_count ?? null,
  };

  return (
    <div>
      <PageHeader title="メニュー編集" />
      <div className="p-6">
        <MenuForm
          brandId={brandId}
          categories={categoryOptions}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
