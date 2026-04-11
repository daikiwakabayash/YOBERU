import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
import { getStores } from "@/feature/store/services/getStores";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

type StoreRow = Awaited<ReturnType<typeof getStores>>[number];

export default async function StoreListPage() {
  const brandId = await getActiveBrandId();
  let stores: StoreRow[] = [];
  try {
    stores = await getStores(brandId);
  } catch {
    // Fallback to empty list on error (e.g. table missing or FK issue)
  }

  return (
    <div>
      <PageHeader
        title="店舗一覧"
        description="店舗マスターの管理を行います"
        actions={
          <Link href="/store/register">
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              新規登録
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        {stores.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            店舗が登録されていません。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店舗名</TableHead>
                <TableHead>エリア</TableHead>
                <TableHead>住所</TableHead>
                <TableHead>電話番号</TableHead>
                <TableHead className="w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell className="font-medium">{shop.name}</TableCell>
                  <TableCell>
                    {(shop.areas as { name: string } | null)?.name ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {shop.zip_code && `〒${shop.zip_code} `}
                    {shop.address ?? "-"}
                  </TableCell>
                  <TableCell>{shop.phone_number ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/store/${shop.id}`}>
                      <Button variant="ghost" size="sm" title="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
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
