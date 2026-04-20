import Link from "next/link";
import { getMenus, getMenuCategories } from "../services/getMenus";
import { MenuListTable, type MenuRow } from "./MenuListTable";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus } from "lucide-react";

interface MenuListProps {
  brandId: number;
  categoryId?: number;
}

export async function MenuList({ brandId, categoryId }: MenuListProps) {
  const [menus, categories] = await Promise.all([
    getMenus(brandId, categoryId ? { categoryId } : undefined),
    getMenuCategories(brandId),
  ]);

  const rows: MenuRow[] = menus.map((m) => ({
    id: m.id,
    name: m.name,
    price: m.price,
    duration: m.duration,
    status: m.status,
    sort_number: m.sort_number,
    categoryName:
      (m.menu_categories as { name: string } | null)?.name ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="メニュー一覧"
        actions={
          <Link href="/menu/register">
            <Button>
              <Plus className="size-4" />
              新規登録
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        {/* Category filter */}
        {categories.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link href="/menu">
              <Badge variant={!categoryId ? "default" : "outline"}>
                すべて
              </Badge>
            </Link>
            {categories.map((cat) => (
              <Link key={cat.id} href={`/menu?categoryId=${cat.id}`}>
                <Badge
                  variant={categoryId === cat.id ? "default" : "outline"}
                >
                  {cat.name}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            メニューが登録されていません。
          </p>
        ) : (
          <MenuListTable menus={rows} />
        )}
      </div>
    </div>
  );
}
