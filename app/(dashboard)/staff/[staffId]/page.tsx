import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaffForm } from "@/feature/staff/components/StaffForm";
import { getStaff } from "@/feature/staff/services/getStaffs";
import { getWorkPatterns } from "@/feature/staff/services/getWorkPatterns";

interface StaffDetailPageProps {
  params: Promise<{ staffId: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { staffId } = await params;
  const id = Number(staffId);
  if (isNaN(id)) notFound();

  let staff;
  try {
    staff = await getStaff(id);
  } catch {
    notFound();
  }

  let workPatterns: Awaited<ReturnType<typeof getWorkPatterns>> = [];
  try {
    workPatterns = await getWorkPatterns(staff.shop_id);
  } catch {
    // If fetching fails, show form with empty patterns
  }

  // migration 00031 未適用な環境では employment_type 等のカラムが取得できない
  // ので、いずれもオプショナルに受けてフォームのデフォルトに倒す。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = staff;
  const initialData = {
    id: s.id,
    brand_id: s.brand_id,
    shop_id: s.shop_id,
    name: s.name,
    capacity: s.capacity ?? 1,
    phone_number: s.phone_number ?? "",
    allocate_order: s.allocate_order ?? 0,
    shift_monday: s.shift_monday ?? null,
    shift_tuesday: s.shift_tuesday ?? null,
    shift_wednesday: s.shift_wednesday ?? null,
    shift_thursday: s.shift_thursday ?? null,
    shift_friday: s.shift_friday ?? null,
    shift_saturday: s.shift_saturday ?? null,
    shift_sunday: s.shift_sunday ?? null,
    shift_holiday: s.shift_holiday ?? null,
    is_public: s.is_public ?? true,
    employment_type:
      s.employment_type === "regular" ? ("regular" as const) : ("contractor" as const),
    hired_at: s.hired_at ?? "",
    birthday: s.birthday ?? "",
    children_count: s.children_count ?? 0,
    monthly_min_salary: s.monthly_min_salary ?? 260000,
    payroll_email: s.payroll_email ?? "",
  };

  return (
    <div>
      <PageHeader title="スタッフ詳細" description={staff.name} />
      <div className="p-6">
        <StaffForm
          brandId={staff.brand_id}
          shopId={staff.shop_id}
          workPatterns={workPatterns}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
