import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import { getActiveCustomerPlans } from "@/feature/customer-plan/services/getCustomerPlans";
import { PlanCountEditor } from "@/feature/customer-plan/components/PlanCountEditor";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CustomerRecordPageProps {
  params: Promise<{ customerId: string }>;
}

export const dynamic = "force-dynamic";

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

  // 会員プラン残数の取得。テーブル未セットアップ時は空配列が返る (致命的エラーに
  // はしない)。
  const activePlans = await getActiveCustomerPlans(id).catch(() => []);

  return (
    <div>
      <PageHeader title="台帳編集" description={fullName} />
      <div className="space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>加入中の会員プラン</CardTitle>
          </CardHeader>
          <CardContent>
            {activePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                加入中のプランはありません。
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activePlans.map((p) => {
                  const isTicket = p.plan_type === "ticket";
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium">
                          {p.menu_name_snapshot}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isTicket
                            ? "回数券"
                            : p.next_billing_date
                              ? `月額 (次回課金 ${p.next_billing_date})`
                              : "月額"}
                          {" ・ "}
                          購入日 {p.purchased_at.slice(0, 10)}
                        </p>
                      </div>
                      <PlanCountEditor
                        planId={p.id}
                        planType={p.plan_type}
                        totalCount={p.total_count}
                        usedCount={p.used_count ?? 0}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

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
