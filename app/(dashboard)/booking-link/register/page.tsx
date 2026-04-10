import { PageHeader } from "@/components/layout/PageHeader";
import { BookingLinkForm } from "@/feature/booking-link/components/BookingLinkForm";
import { createClient } from "@/helper/lib/supabase/server";

const SHOP_ID = 1;
const BRAND_ID = 1;

export default async function BookingLinkRegisterPage() {
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
      <PageHeader title="強制リンク作成" description="新規予約リンクを発行" />
      <div className="p-6">
        <BookingLinkForm
          brandId={BRAND_ID}
          menus={menus}
          visitSources={sourceRes.data ?? []}
        />
      </div>
    </div>
  );
}
