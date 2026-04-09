import { MenuCategoryList } from "@/feature/menu/components/MenuCategoryList";

export default function MenuCategoryListPage() {
  // TODO: brandId should come from the authenticated user's session
  const brandId = 1;

  return <MenuCategoryList brandId={brandId} />;
}
