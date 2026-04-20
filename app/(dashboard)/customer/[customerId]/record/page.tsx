import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import { getActiveCustomerPlans } from "@/feature/customer-plan/services/getCustomerPlans";
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
                  const remaining =
                    isTicket && p.total_count != null
                      ? Math.max(0, p.total_count - (p.used_count ?? 0))
                      : null;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between py-3"
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
                      <div className="ml-4 text-right text-sm">
                        {isTicket && p.total_count != null ? (
                          <>
                            <span className="text-2xl font-bold text-emerald-600">
                              {remaining}
                            </span>
                            <span className="ml-1 text-xs text-muted-foreground">
                              / {p.total_count} 回 残
                            </span>
                          </>
                        ) : (
                          <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                            契約中
                          </span>
                        )}
                      </div>
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
