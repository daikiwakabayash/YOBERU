import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationCalendar } from "@/feature/reservation/components/ReservationCalendar";
import { ReservationCalendarToolbar } from "@/feature/reservation/components/ReservationCalendarToolbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCalendarData } from "@/feature/reservation/services/getCalendarData";
import { generateTimeSlots } from "@/helper/utils/time";
import type { CalendarData } from "@/feature/reservation/types";

const SHOP_ID = 1; // TODO: Get from session

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
    // Supabase not connected or no data - show empty calendar with time slots
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
          <div className="flex items-center gap-4">
            <ReservationCalendarToolbar currentDate={date} />
            <Link href={`/reservation/register?date=${date}`}>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                新規予約
              </Button>
            </Link>
          </div>
        }
      />
      <div className="p-6">
        <ReservationCalendar data={data} date={date} />
      </div>
    </div>
  );
}
