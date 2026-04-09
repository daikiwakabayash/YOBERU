import { MenuList } from "@/feature/menu/components/MenuList";

interface Props {
  searchParams: Promise<{ categoryId?: string }>;
}

export default async function MenuListPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryId = params.categoryId ? Number(params.categoryId) : undefined;

  // TODO: brandId should come from the authenticated user's session
  const brandId = 1;

  return <MenuList brandId={brandId} categoryId={categoryId} />;
}
