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

  // Fetch staff list (needed for both views - toolbar staff dropdown)
  const supabase = await createClient();
  let allStaffs: Array<{ id: number; name: string }> = [];
  try {
    const { data: staffData } = await supabase
      .from("staffs")
      .select("id, name")
      .eq("shop_id", SHOP_ID)
      .is("deleted_at", null)
      .eq("is_public", true)
      .order("allocate_order", { ascending: true, nullsFirst: false });
    allStaffs = staffData ?? [];
  } catch {
    // Staff fetch failed
  }

  // Fetch menus and visit sources (shared)
  let menus: Array<{ menu_manage_id: string; name: string; price: number; duration: number }> = [];
  let visitSources: Array<{ id: number; name: string }> = [];
  try {
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

  // Auto-select first staff if week view and no staff selected
  const effectiveStaffId =
    viewMode === "week" && !staffId && allStaffs.length > 0
      ? allStaffs[0].id
      : staffId;

  if (viewMode === "week") {
    let weekData: WeeklyCalendarData;
    try {
      weekData = await getWeeklyCalendarData(SHOP_ID, date, effectiveStaffId);
    } catch {
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
            shopId={SHOP_ID}
            brandId={BRAND_ID}
            staffId={effectiveStaffId}
          />
        </div>
      </div>
    );
  }

  // Day view (default)
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
          shopId={SHOP_ID}
          brandId={BRAND_ID}
        />
      </div>
    </div>
  );
}
