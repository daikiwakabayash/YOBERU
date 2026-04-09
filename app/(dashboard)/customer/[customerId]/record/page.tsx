import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CustomerRecordPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerRecordPage({ params }: CustomerRecordPageProps) {
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
      <PageHeader title="台帳編集" description={fullName} />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>カルテ・台帳</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              台帳の編集機能は準備中です。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
