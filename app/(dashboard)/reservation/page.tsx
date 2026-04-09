import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationCalendar } from "@/feature/reservation/components/ReservationCalendar";
import { ReservationCalendarToolbar } from "@/feature/reservation/components/ReservationCalendarToolbar";
import { AggregationButton } from "@/feature/reservation/components/AggregationButton";
import { getCalendarData } from "@/feature/reservation/services/getCalendarData";
import { generateTimeSlots } from "@/helper/utils/time";
import { createClient } from "@/helper/lib/supabase/server";
import type { CalendarData } from "@/feature/reservation/types";

export const dynamic = "force-dynamic"; // Always fetch fresh data

const SHOP_ID = 1;
const BRAND_ID = 1;

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || new Date().toISOString().split("T")[0];

  let data: CalendarData;
  try {
    data = await getCalendarData(SHOP_ID, date);
  } catch {
    data = {
      staffs: [],
      appointments: [],
      timeSlots: generateTimeSlots(9, 21, 15),
      frameMin: 15,
    };
  }

  let menus: Array<{ menu_manage_id: string; name: string; price: number; duration: number }> = [];
  let visitSources: Array<{ id: number; name: string }> = [];
  try {
    const supabase = await createClient();
    const { data: menuData } = await supabase
      .from("menus")
      .select("menu_manage_id, name, price, duration")
      .eq("shop_id", SHOP_ID)
      .eq("status", true)
      .is("deleted_at", null)
      .order("sort_number");
    menus = menuData ?? [];

    const { data: sourceData } = await supabase
      .from("visit_sources")
      .select("id, name")
      .eq("shop_id", SHOP_ID)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_number");
    visitSources = sourceData ?? [];
  } catch {
    // Tables may not exist yet
  }

  return (
    <div>
      <PageHeader
        title="予約表"
        actions={
          <div className="flex items-center gap-3">
            <AggregationButton shopId={SHOP_ID} date={date} />
            <ReservationCalendarToolbar currentDate={date} />
          </div>
        }
      />
      <div className="p-4">
        <ReservationCalendar
          data={data}
          date={date}
          menus={menus}
          visitSources={visitSources}
          shopId={SHOP_ID}
          brandId={BRAND_ID}
        />
      </div>
    </div>
  );
}
