import { PageHeader } from "@/components/layout/PageHeader";
import { BookingLinkList } from "@/feature/booking-link/components/BookingLinkList";
import { getBookingLinks } from "@/feature/booking-link/services/getBookingLinks";
import { SetupRequiredNotice } from "@/feature/booking-link/components/SetupRequiredNotice";

const BRAND_ID = 1;

export const dynamic = "force-dynamic";

export default async function BookingLinkPage() {
  const { data: links, setupRequired } = await getBookingLinks(BRAND_ID);

  return (
    <div>
      <PageHeader
        title="強制リンク作成"
        description="広告・HP用の予約URLを発行します。Meta広告用・HP用に流入元を自動記録できます。"
      />
      <div className="p-6">
        {setupRequired ? <SetupRequiredNotice /> : <BookingLinkList links={links} />}
      </div>
    </div>
  );
}
