import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerForm } from "@/feature/customer/components/CustomerForm";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import { getStaffs } from "@/feature/staff/services/getStaffs";

interface CustomerDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { customerId } = await params;
  const id = Number(customerId);
  if (isNaN(id)) notFound();

  let customer;
  try {
    customer = await getCustomer(id);
  } catch {
    notFound();
  }

  let staffs: { id: number; name: string }[] = [];
  try {
    const staffData = await getStaffs(customer.shop_id);
    staffs = staffData.map((s: { id: number; name: string }) => ({
      id: s.id,
      name: s.name,
    }));
  } catch {
    // If fetching fails, show form with empty staff list
  }

  const fullName = [customer.last_name, customer.first_name]
    .filter(Boolean)
    .join(" ") || "顧客";

  const initialData = {
    id: customer.id,
    brand_id: customer.brand_id,
    shop_id: customer.shop_id,
    type: customer.type ?? 0,
    last_name: customer.last_name ?? "",
    first_name: customer.first_name ?? "",
    last_name_kana: customer.last_name_kana ?? "",
    first_name_kana: customer.first_name_kana ?? "",
    phone_number_1: customer.phone_number_1 ?? "",
    phone_number_2: customer.phone_number_2 ?? "",
    email: customer.email ?? "",
    zip_code: customer.zip_code ?? "",
    address: customer.address ?? "",
    gender: customer.gender ?? 0,
    birth_date: customer.birth_date ?? "",
    staff_id: customer.staff_id ?? null,
    customer_tag_id: customer.customer_tag_id ?? null,
    occupation: customer.occupation ?? "",
    is_send_dm: customer.is_send_dm ?? false,
    is_send_mail: customer.is_send_mail ?? false,
    is_send_line: customer.is_send_line ?? false,
    line_id: customer.line_id ?? "",
    description: customer.description ?? "",
  };

  return (
    <div>
      <PageHeader title="顧客詳細" description={fullName} />
      <div className="p-6">
        <CustomerForm
          brandId={customer.brand_id}
          shopId={customer.shop_id}
          staffs={staffs}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
