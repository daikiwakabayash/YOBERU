import Link from "next/link";
import { getMenuCategories } from "../services/getMenus";
import { MenuCategoryDeleteButton } from "./MenuCategoryDeleteButton";

import { Button } from "@/components/ui/button";
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

interface MenuCategoryListProps {
  brandId: number;
}

export async function MenuCategoryList({ brandId }: MenuCategoryListProps) {
  const categories = await getMenuCategories(brandId);

  return (
    <div>
      <PageHeader
        title="メニューカテゴリ一覧"
        actions={
          <Link href="/menu-category/register">
            <Button>
              <Plus className="size-4" />
              新規登録
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            メニューカテゴリが登録されていません。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>カテゴリ名</TableHead>
                <TableHead>適用範囲</TableHead>
                <TableHead className="text-right">表示順</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    {cat.shop_id
                      ? (cat.shops as { name: string } | null)?.name ?? "店舗限定"
                      : "ブランド共通"}
                  </TableCell>
                  <TableCell className="text-right">
                    {cat.sort_number}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link href={`/menu-category/register?id=${cat.id}`}>
                        <Button variant="ghost" size="icon-sm">
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                      <MenuCategoryDeleteButton id={cat.id} name={cat.name} />
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
