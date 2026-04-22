import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CustomerHistoryPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerHistoryPage({ params }: CustomerHistoryPageProps) {
  const { customerId } = await params;
  const id = Number(customerId);
  if (isNaN(id)) notFound();

  let customer;
  try {
    customer = await getCustomer(id);
  } catch {
    notFound();
  }

  const fullName = [customer.last_name, customer.first_name]
    .filter(Boolean)
    .join(" ") || "顧客";

  return (
    <div>
      <PageHeader
        title="来店履歴"
        description={fullName}
        actions={
          <Link href={`/customer/${id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>来店日</TableHead>
              <TableHead>メニュー</TableHead>
              <TableHead>担当スタッフ</TableHead>
              <TableHead className="text-right">金額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-muted-foreground"
              >
                来店履歴はまだありません
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
