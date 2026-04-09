import { PageHeader } from "@/components/layout/PageHeader";
import { ReceptionList } from "@/feature/reception/components/ReceptionList";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || new Date().toISOString().split("T")[0];

  // TODO: Fetch from Supabase via getTodayAppointments(shopId, date)

  return (
    <div>
      <PageHeader
        title="受付"
        description={`${date} の予約を管理`}
        actions={
          <Link href={`/reservation?date=${date}`}>
            <Button variant="outline" size="sm">
              <CalendarDays className="mr-2 h-4 w-4" />
              予約表を見る
            </Button>
          </Link>
        }
      />
      <div className="max-w-3xl p-6">
        <ReceptionList appointments={[]} />
      </div>
    </div>
  );
}
