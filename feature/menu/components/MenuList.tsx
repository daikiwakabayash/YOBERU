import Link from "next/link";
import { getMenus, getMenuCategories } from "../services/getMenus";
import { MenuDeleteButton } from "./MenuDeleteButton";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Pencil, Plus } from "lucide-react";

interface MenuListProps {
  brandId: number;
  categoryId?: number;
}

export async function MenuList({ brandId, categoryId }: MenuListProps) {
  const [menus, categories] = await Promise.all([
    getMenus(brandId, categoryId ? { categoryId } : undefined),
    getMenuCategories(brandId),
  ]);

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

        {menus.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            メニューが登録されていません。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>メニュー名</TableHead>
                <TableHead>カテゴリ</TableHead>
                <TableHead className="text-right">料金</TableHead>
                <TableHead className="text-right">施術時間</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">表示順</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menus.map((menu) => (
                <TableRow key={menu.id}>
                  <TableCell className="font-medium">{menu.name}</TableCell>
                  <TableCell>
                    {(menu.menu_categories as { name: string } | null)?.name ??
                      "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {menu.price.toLocaleString()}円
                  </TableCell>
                  <TableCell className="text-right">
                    {menu.duration}分
                  </TableCell>
                  <TableCell>
                    {menu.status ? (
                      <Badge variant="default">公開</Badge>
                    ) : (
                      <Badge variant="secondary">非公開</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {menu.sort_number}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link href={`/menu/${menu.id}`}>
                        <Button variant="ghost" size="icon-sm">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                      <MenuDeleteButton id={menu.id} name={menu.name} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
