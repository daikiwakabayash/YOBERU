import { PageHeader } from "@/components/layout/PageHeader";
import { ReservationDetail } from "@/feature/reservation/components/ReservationDetail";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;

  // TODO: Fetch from Supabase via getAppointment(id)
  // For now show placeholder
  return (
    <div>
      <PageHeader
        title="予約詳細"
        description={`予約ID: ${reservationId}`}
        actions={
          <Link href="/reservation">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              予約表に戻る
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <p className="text-muted-foreground">
          Supabase 接続後に予約詳細が表示されます
        </p>
      </div>
    </div>
  );
}
