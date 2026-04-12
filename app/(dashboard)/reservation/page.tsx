import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationCalendar } from "@/feature/reservation/components/ReservationCalendar";
import { WeeklyReservationCalendar } from "@/feature/reservation/components/WeeklyReservationCalendar";
import { ReservationCalendarToolbar } from "@/feature/reservation/components/ReservationCalendarToolbar";
import { DateResetOnReload } from "@/feature/reservation/components/DateResetOnReload";
import { getCalendarData } from "@/feature/reservation/services/getCalendarData";
import { getWeeklyCalendarData } from "@/feature/reservation/services/getWeeklyCalendarData";
import { generateTimeSlots, toLocalDateString } from "@/helper/utils/time";
import { createClient } from "@/helper/lib/supabase/server";
import type { CalendarData } from "@/feature/reservation/types";
import type { WeeklyCalendarData } from "@/feature/reservation/services/getWeeklyCalendarData";
import { Suspense } from "react";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

// Disable caching so master updates reflect immediately
export const dynamic = "force-dynamic";

/**
 * Safe query helper — returns empty array on error so missing tables
 * don't break the whole page.
 */
async function safeQuery<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  try {
    const result = await query;
    if (result.error) return [];
    return result.data ?? [];
  } catch {
    return [];
  }
}

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; staff?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || toLocalDateString(new Date());
  const viewMode = params.view === "week" ? "week" : "day";
  const staffId = params.staff ? Number(params.staff) : null;

  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  const supabase = await createClient();

  // ALL independent queries in ONE Promise.all — no sequential calls.
  // The enableMeetingBooking shop query was previously serial (blocking
  // 50-100ms before the main batch); now it's in the same batch.
  const [allStaffs, menus, visitSources, paymentMethods, dayData, weekDataEarly, shopSettings] =
    await Promise.all([
      safeQuery<{ id: number; name: string }>(
        supabase
          .from("staffs")
          .select("id, name")
          .eq("shop_id", shopId)
          .is("deleted_at", null)
          .eq("is_public", true)
          .order("allocate_order", { ascending: true, nullsFirst: false })
      ),
      safeQuery<{
        menu_manage_id: string;
        name: string;
        price: number;
        duration: number;
      }>(
        // status = TRUE → 「公開」のみ。非公開に設定したメニューは予約
        // 入力パネルにも出さない (マスター側の表示トグルを尊重)。
        supabase
          .from("menus")
          .select("menu_manage_id, name, price, duration")
          .eq("brand_id", brandId)
          .eq("status", true)
          .or(`shop_id.is.null,shop_id.eq.${shopId}`)
          .is("deleted_at", null)
          .order("sort_number")
      ),
      safeQuery<{ id: number; name: string; color: string | null; label_text_color: string | null }>(
        supabase
          .from("visit_sources")
          .select("id, name, color, label_text_color")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("sort_number")
      ),
      safeQuery<{ code: string; name: string }>(
        supabase
          .from("payment_methods")
          .select("code, name")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("sort_number")
      ),
      viewMode === "day"
        ? getCalendarData(shopId, date).catch(() => null)
        : Promise.resolve(null),
      viewMode === "week" && staffId
        ? getWeeklyCalendarData(shopId, date, staffId).catch(() => null)
        : Promise.resolve(null),
      // Shop settings (enable_meeting_booking) — merged into the batch
      // instead of blocking before it. Falls back to defaults if the
      // column doesn't exist yet (migration 00010 not applied).
      (async () => {
        try {
          const r = await supabase
            .from("shops")
            .select("enable_meeting_booking")
            .eq("id", shopId)
            .maybeSingle();
          return r.data;
        } catch {
          return null;
        }
      })(),
    ]);

  const enableMeetingBooking =
    typeof (shopSettings as { enable_meeting_booking?: unknown })
      ?.enable_meeting_booking === "boolean"
      ? (shopSettings as { enable_meeting_booking: boolean })
          .enable_meeting_booking
      : true;

  // Auto-select first staff if week view and no staff selected
  const effectiveStaffId =
    viewMode === "week" && !staffId && allStaffs.length > 0
      ? allStaffs[0].id
      : staffId;

  if (viewMode === "week") {
    let weekData: WeeklyCalendarData | null = weekDataEarly;
    if (!weekData && effectiveStaffId) {
      try {
        weekData = await getWeeklyCalendarData(shopId, date, effectiveStaffId);
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
        staffUtilizationRate: null,
        staffOpenMin: 0,
        staffBusyMin: 0,
        dailyUtilization: [],
      };
    }

    return (
      <div>
        <Suspense fallback={null}>
          <DateResetOnReload />
        </Suspense>
        <PageHeader
          title="予約表"
          actions={
            <ReservationCalendarToolbar
              currentDate={date}
              viewMode="week"
              staffs={allStaffs}
              selectedStaffId={effectiveStaffId}
              pendingCount={weekData.appointments.filter(
                (a) => a.type === 0 && a.status === 0
              ).length}
            />
          }
        />
        <div className="p-4">
          <WeeklyReservationCalendar
            data={weekData}
            menus={menus}
            visitSources={visitSources}
            paymentMethods={paymentMethods}
            shopId={shopId}
            brandId={brandId}
            staffId={effectiveStaffId}
            enableMeetingBooking={enableMeetingBooking}
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

  // Count customer appointments (type=0) still in 待機 status (0).
  // Slot blocks (type!=0) are excluded — they don't need to be
  // "completed" before aggregation runs.
  const pendingCount = data.appointments.filter(
    (a) => a.type === 0 && a.status === 0
  ).length;

  return (
    <div>
      <Suspense fallback={null}>
        <DateResetOnReload />
      </Suspense>
      <PageHeader
        title="予約表"
        actions={
          <ReservationCalendarToolbar
            currentDate={date}
            viewMode="day"
            staffs={allStaffs}
            selectedStaffId={staffId}
            pendingCount={pendingCount}
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
          shopId={shopId}
          brandId={brandId}
          enableMeetingBooking={enableMeetingBooking}
        />
      </div>
    </div>
  );
}
