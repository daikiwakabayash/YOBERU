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

  const initialData = {
    id: staff.id,
    brand_id: staff.brand_id,
    shop_id: staff.shop_id,
    name: staff.name,
    capacity: staff.capacity ?? 1,
    phone_number: staff.phone_number ?? "",
    allocate_order: staff.allocate_order ?? 0,
    shift_monday: staff.shift_monday ?? null,
    shift_tuesday: staff.shift_tuesday ?? null,
    shift_wednesday: staff.shift_wednesday ?? null,
    shift_thursday: staff.shift_thursday ?? null,
    shift_friday: staff.shift_friday ?? null,
    shift_saturday: staff.shift_saturday ?? null,
    shift_sunday: staff.shift_sunday ?? null,
    shift_holiday: staff.shift_holiday ?? null,
    is_public: staff.is_public ?? true,
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
