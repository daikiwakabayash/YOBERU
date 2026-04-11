import { PageHeader } from "@/components/layout/PageHeader";
import { BookingLinkList } from "@/feature/booking-link/components/BookingLinkList";
import { getBookingLinks } from "@/feature/booking-link/services/getBookingLinks";
import { SetupRequiredNotice } from "@/feature/booking-link/components/SetupRequiredNotice";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function BookingLinkPage() {
  const brandId = await getActiveBrandId();
  const { data: links, setupRequired } = await getBookingLinks(brandId);

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
