import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerBackButton } from "@/feature/customer/components/CustomerBackButton";
import { CustomerForm } from "@/feature/customer/components/CustomerForm";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import { getStaffs } from "@/feature/staff/services/getStaffs";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import type { CustomerFormValues } from "@/feature/customer/schema/customer.schema";

interface CustomerEditPageProps {
  params: Promise<{ customerId: string }>;
}

export const dynamic = "force-dynamic";

export default async function CustomerEditPage({
  params,
}: CustomerEditPageProps) {
  const { customerId } = await params;
  const id = Number(customerId);

  // 詳細ページと同じ方針: 顧客が見つからなくても 404 にせず、
  // 戻るボタン付きの説明 UI を表示する。予約パネル経由で来た人が
  // 予約表へ戻れなくなる事故を防ぐため。
  let customer;
  if (!isNaN(id)) {
    try {
      customer = await getCustomer(id);
    } catch {
      customer = undefined;
    }
  }
  if (!customer) {
    return (
      <div>
        <PageHeader
          title="顧客が見つかりません"
          description={`ID: ${customerId}`}
          actions={
            <div className="flex items-center gap-2">
              <CustomerBackButton />
              <Link href="/customer">
                <Button variant="outline" size="sm">
                  顧客一覧へ
                </Button>
              </Link>
            </div>
          }
        />
        <div className="p-6">
          <Card>
            <CardContent className="space-y-2 py-8 text-center text-sm text-gray-500">
              <p>編集対象の顧客が見つかりませんでした。</p>
              <p className="text-xs text-gray-400">
                顧客が削除済みか、URL の ID が正しくない可能性があります。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const brandId = await getActiveBrandId();
  const shopId = await getActiveShopId();

  let staffs: { id: number; name: string }[] = [];
  try {
    const staffData = await getStaffs(shopId);
    staffs = staffData.map((s: { id: number; name: string }) => ({
      id: s.id,
      name: s.name,
    }));
  } catch {
    // If fetching fails, show form with empty staff list
  }

  const fullName =
    [customer.last_name, customer.first_name]
      .filter(Boolean)
      .join(" ") || "顧客";

  // CustomerForm の initialData に渡すために DB 行 → Form 値へ変換。
  // null を空文字にフォールバックして controlled input の警告を避ける。
  const initialData: CustomerFormValues & { id: number } = {
    id,
    brand_id: (customer.brand_id as number) ?? brandId,
    shop_id: (customer.shop_id as number) ?? shopId,
    type: (customer.type as number) ?? 0,
    last_name: (customer.last_name as string | null) ?? "",
    first_name: (customer.first_name as string | null) ?? "",
    last_name_kana: (customer.last_name_kana as string | null) ?? "",
    first_name_kana: (customer.first_name_kana as string | null) ?? "",
    phone_number_1: (customer.phone_number_1 as string | null) ?? "",
    phone_number_2: (customer.phone_number_2 as string | null) ?? "",
    email: (customer.email as string | null) ?? "",
    zip_code: (customer.zip_code as string | null) ?? "",
    address: (customer.address as string | null) ?? "",
    gender: (customer.gender as number) ?? 0,
    birth_date: (customer.birth_date as string | null) ?? "",
    staff_id: (customer.staff_id as number | null) ?? null,
    customer_tag_id: (customer.customer_tag_id as number | null) ?? null,
    occupation: (customer.occupation as string | null) ?? "",
    is_send_dm: !!customer.is_send_dm,
    is_send_mail: !!customer.is_send_mail,
    is_send_line: !!customer.is_send_line,
    line_id: (customer.line_id as string | null) ?? "",
    description: (customer.description as string | null) ?? "",
  };

  return (
    <div>
      <PageHeader
        title="顧客情報の編集"
        description={fullName}
        actions={
          <div className="flex items-center gap-2">
            <CustomerBackButton />
            <Link href={`/customer/${id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                顧客詳細へ
              </Button>
            </Link>
          </div>
        }
      />
      <div className="p-6">
        <CustomerForm
          brandId={brandId}
          shopId={shopId}
          staffs={staffs}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
