import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationCalendar } from "@/feature/reservation/components/ReservationCalendar";
import { ReservationCalendarToolbar } from "@/feature/reservation/components/ReservationCalendarToolbar";
import { AggregationButton } from "@/feature/reservation/components/AggregationButton";
import { WeekView } from "@/feature/reservation/components/WeekView";
import { getCalendarData } from "@/feature/reservation/services/getCalendarData";
import { generateTimeSlots } from "@/helper/utils/time";
import { getWeekDates } from "@/helper/utils/weekday";
import { createClient } from "@/helper/lib/supabase/server";
import type { CalendarData } from "@/feature/reservation/types";

export const dynamic = "force-dynamic";

const SHOP_ID = 1;
const BRAND_ID = 1;

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; staff?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || new Date().toISOString().split("T")[0];
  const viewMode = params.view === "week" ? "week" : "day";
  const selectedStaffId = params.staff ? Number(params.staff) : null;

  // Common data: menus and visit sources
  let menus: Array<{ menu_manage_id: string; name: string; price: number; duration: number }> = [];
  let visitSources: Array<{ id: number; name: string }> = [];
  let allStaffs: Array<{ id: number; name: string }> = [];

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

    const { data: staffData } = await supabase
      .from("staffs")
      .select("id, name")
      .eq("shop_id", SHOP_ID)
      .is("deleted_at", null)
      .eq("is_public", true)
      .order("allocate_order", { ascending: true, nullsFirst: false });
    allStaffs = staffData ?? [];
  } catch {
    // Tables may not exist yet
  }

  if (viewMode === "week") {
    // Week view: fetch appointments for the whole week
    const weekDates = getWeekDates(new Date(date + "T00:00:00"));
    const weekStart = weekDates[0].toISOString().split("T")[0];
    const weekEnd = weekDates[6].toISOString().split("T")[0];
    const staffId = selectedStaffId || (allStaffs[0]?.id ?? 1);
    const staffName = allStaffs.find((s) => s.id === staffId)?.name ?? "";

    let weekAppts: CalendarData["appointments"] = [];
    const frameMin = 30; // default
    try {
      const supabase = await createClient();
      const nextDay = new Date(weekEnd + "T00:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      const { data: apptData } = await supabase
        .from("appointments")
        .select("id, staff_id, customer_id, start_at, end_at, status, type, menu_manage_id, memo, sales, customer_record, visit_count, visit_source_id, additional_charge, payment_method, customers(last_name, first_name, phone_number_1, visit_count), visit_sources(name)")
        .eq("shop_id", SHOP_ID)
        .eq("staff_id", staffId)
        .gte("start_at", `${weekStart}T00:00:00`)
        .lt("start_at", `${nextDay.toISOString().split("T")[0]}T00:00:00`)
        .is("cancelled_at", null)
        .is("deleted_at", null)
        .order("start_at");

      // Map to CalendarAppointment format
      const menuIds = [...new Set((apptData ?? []).map((a) => a.menu_manage_id))];
      let menuMap = new Map<string, { name: string; duration: number }>();
      if (menuIds.length > 0) {
        const { data: menuResults } = await supabase
          .from("menus")
          .select("menu_manage_id, name, duration")
          .in("menu_manage_id", menuIds);
        menuMap = new Map((menuResults ?? []).map((m) => [m.menu_manage_id, { name: m.name, duration: m.duration }]));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      weekAppts = (apptData ?? []).map((a: any) => {
        const customer = a.customers;
        const vs = a.visit_sources;
        const menu = menuMap.get(a.menu_manage_id);
        const vc = customer?.visit_count ?? a.visit_count ?? 0;
        return {
          id: a.id,
          staffId: a.staff_id,
          customerId: a.customer_id,
          menuManageId: a.menu_manage_id,
          customerName: customer ? `${customer.last_name ?? ""} ${customer.first_name ?? ""}`.trim() : "不明",
          customerPhone: customer?.phone_number_1 ?? null,
          menuName: menu?.name ?? "不明",
          startAt: a.start_at,
          endAt: a.end_at,
          status: a.status,
          type: a.type,
          duration: menu?.duration ?? 0,
          memo: a.memo ?? null,
          isNewCustomer: vc <= 1,
          visitCount: vc,
          source: vs?.name ?? null,
          visitSourceId: a.visit_source_id ?? null,
          sales: a.sales ?? 0,
          additionalCharge: a.additional_charge ?? 0,
          paymentMethod: a.payment_method ?? null,
          customerRecord: a.customer_record ?? null,
        };
      });
    } catch {
      // Supabase not connected
    }

    return (
      <div>
        <PageHeader
          title="予約表"
          actions={
            <div className="flex items-center gap-3">
              <AggregationButton shopId={SHOP_ID} date={date} appointments={weekAppts.map(a => ({ id: a.id, status: a.status }))} />
              <ReservationCalendarToolbar
                currentDate={date}
                viewMode="week"
                staffs={allStaffs}
                selectedStaffId={staffId}
              />
            </div>
          }
        />
        <div className="p-4">
          <WeekView
            staffId={staffId}
            staffName={staffName}
            weekStart={weekStart}
            appointments={weekAppts}
            timeSlots={generateTimeSlots(9, 21, frameMin)}
            frameMin={frameMin}
            menus={menus}
            visitSources={visitSources}
            shopId={SHOP_ID}
            brandId={BRAND_ID}
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
          <div className="flex items-center gap-3">
            <AggregationButton shopId={SHOP_ID} date={date} appointments={data.appointments.map(a => ({ id: a.id, status: a.status }))} />
            <ReservationCalendarToolbar
              currentDate={date}
              viewMode="day"
              staffs={allStaffs}
            />
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
