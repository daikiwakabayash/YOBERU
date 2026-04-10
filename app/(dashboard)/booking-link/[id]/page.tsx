import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { BookingLinkForm } from "@/feature/booking-link/components/BookingLinkForm";
import { getBookingLinkById } from "@/feature/booking-link/services/getBookingLinks";
import { createClient } from "@/helper/lib/supabase/server";

const SHOP_ID = 1;
const BRAND_ID = 1;

interface BookingLinkEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingLinkEditPage({
  params,
}: BookingLinkEditPageProps) {
  const { id } = await params;
  const linkId = Number(id);
  if (isNaN(linkId)) notFound();

  const link = await getBookingLinkById(linkId);
  if (!link) notFound();

  const supabase = await createClient();

  const [menuRes, sourceRes, categoryRes] = await Promise.all([
    supabase
      .from("menus")
      .select("menu_manage_id, name, price, duration, menu_category_id")
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
      .from("menu_categories")
      .select("id, name")
      .eq("shop_id", SHOP_ID)
      .is("deleted_at", null)
      .order("sort_number"),
  ]);

  const categoryMap = new Map(
    (categoryRes.data ?? []).map(
      (c: { id: number; name: string }) => [c.id, c.name]
    )
  );

  const menus = (menuRes.data ?? []).map(
    (m: {
      menu_manage_id: string;
      name: string;
      price: number;
      duration: number;
      menu_category_id: number | null;
    }) => ({
      menu_manage_id: m.menu_manage_id,
      name: m.name,
      price: m.price,
      duration: m.duration,
      category_name: m.menu_category_id
        ? categoryMap.get(m.menu_category_id) ?? null
        : null,
    })
  );

  return (
    <div>
      <PageHeader title="強制リンク編集" description={link.title} />
      <div className="p-6">
        <BookingLinkForm
          brandId={BRAND_ID}
          menus={menus}
          visitSources={sourceRes.data ?? []}
          initialData={link}
        />
      </div>
    </div>
  );
}
