import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationCalendar } from "@/feature/reservation/components/ReservationCalendar";
import { WeeklyReservationCalendar } from "@/feature/reservation/components/WeeklyReservationCalendar";
import { ReservationCalendarToolbar } from "@/feature/reservation/components/ReservationCalendarToolbar";
import { getCalendarData } from "@/feature/reservation/services/getCalendarData";
import { getWeeklyCalendarData } from "@/feature/reservation/services/getWeeklyCalendarData";
import { generateTimeSlots, toLocalDateString } from "@/helper/utils/time";
import { createClient } from "@/helper/lib/supabase/server";
import type { CalendarData } from "@/feature/reservation/types";
import type { WeeklyCalendarData } from "@/feature/reservation/services/getWeeklyCalendarData";

const SHOP_ID = 1;
const BRAND_ID = 1;

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; staff?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || toLocalDateString(new Date());
  const viewMode = params.view === "week" ? "week" : "day";
  const staffId = params.staff ? Number(params.staff) : null;

  const supabase = await createClient();

  // Parallel fetch: staff list + menus + visit sources + payment methods + calendar data
  const [staffRes, menuRes, sourceRes, paymentRes, dayData, weekDataEarly] =
    await Promise.all([
      supabase
        .from("staffs")
        .select("id, name")
        .eq("shop_id", SHOP_ID)
        .is("deleted_at", null)
        .eq("is_public", true)
        .order("allocate_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("menus")
        .select("menu_manage_id, name, price, duration")
        .eq("shop_id", SHOP_ID)
        .eq("status", true)
        .is("deleted_at", null)
        .order("sort_number"),
      supabase
        .from("visit_sources")
        .select("id, name")
        .eq("shop_id", SHOP_ID)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_number"),
      supabase
        .from("payment_methods")
        .select("code, name")
        .eq("shop_id", SHOP_ID)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_number"),
      viewMode === "day"
        ? getCalendarData(SHOP_ID, date).catch(() => null)
        : Promise.resolve(null),
      viewMode === "week" && staffId
        ? getWeeklyCalendarData(SHOP_ID, date, staffId).catch(() => null)
        : Promise.resolve(null),
    ]);

  const allStaffs: Array<{ id: number; name: string }> = staffRes.data ?? [];
  const menus: Array<{
    menu_manage_id: string;
    name: string;
    price: number;
    duration: number;
  }> = menuRes.data ?? [];
  const visitSources: Array<{ id: number; name: string }> = sourceRes.data ?? [];
  const paymentMethods: Array<{ code: string; name: string }> =
    paymentRes.data ?? [];

  // Auto-select first staff if week view and no staff selected
  const effectiveStaffId =
    viewMode === "week" && !staffId && allStaffs.length > 0
      ? allStaffs[0].id
      : staffId;

  if (viewMode === "week") {
    let weekData: WeeklyCalendarData | null = weekDataEarly;
    // If staff was auto-selected (not in URL), fetch now
    if (!weekData && effectiveStaffId) {
      try {
        weekData = await getWeeklyCalendarData(SHOP_ID, date, effectiveStaffId);
      } catch {
        weekData = null;
      }
    }
    if (!weekData) {
      weekData = {
        appointments: [],
        timeSlots: generateTimeSlots(9, 21, 15),
        frameMin: 15,
        weekDates: [],
        staffName: null,
      };
    }

    return (
      <div>
        <PageHeader
          title="予約表"
          actions={
            <ReservationCalendarToolbar
              currentDate={date}
              viewMode="week"
              staffs={allStaffs}
              selectedStaffId={effectiveStaffId}
            />
          }
        />
        <div className="p-4">
          <WeeklyReservationCalendar
            data={weekData}
            menus={menus}
            visitSources={visitSources}
            paymentMethods={paymentMethods}
            shopId={SHOP_ID}
            brandId={BRAND_ID}
            staffId={effectiveStaffId}
          />
        </div>
      </div>
    );
  }

  // Day view (default)
  const data: CalendarData = dayData ?? {
    staffs: [],
    appointments: [],
    timeSlots: generateTimeSlots(9, 21, 15),
    frameMin: 15,
  };

  return (
    <div>
      <PageHeader
        title="予約表"
        actions={
          <ReservationCalendarToolbar
            currentDate={date}
            viewMode="day"
            staffs={allStaffs}
            selectedStaffId={staffId}
          />
        }
      />
      <div className="p-4">
        <ReservationCalendar
          data={data}
          date={date}
          menus={menus}
          visitSources={visitSources}
          paymentMethods={paymentMethods}
          shopId={SHOP_ID}
          brandId={BRAND_ID}
        />
      </div>
    </div>
  );
}
