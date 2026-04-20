import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { BookingLinkForm } from "@/feature/booking-link/components/BookingLinkForm";
import { getBookingLinkById } from "@/feature/booking-link/services/getBookingLinks";
import { getTagTemplates } from "@/feature/tag-template/services/getTagTemplates";
import { createClient } from "@/helper/lib/supabase/server";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

interface BookingLinkEditPageProps {
  params: Promise<{ id: string }>;
}

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

export default async function BookingLinkEditPage({
  params,
}: BookingLinkEditPageProps) {
  const { id } = await params;
  const linkId = Number(id);
  if (isNaN(linkId)) notFound();

  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  const link = await getBookingLinkById(linkId);
  if (!link) notFound();

  const supabase = await createClient();

  const [menuData, sourceData, categoryData, shopsData] = await Promise.all([
    safeQuery<{
      menu_manage_id: string;
      name: string;
      price: number;
      duration: number;
      category_id: number | null;
    }>(
      supabase
        .from("menus")
        .select("menu_manage_id, name, price, duration, category_id")
        .eq("brand_id", brandId)
        .or(`shop_id.is.null,shop_id.eq.${shopId}`)
        .is("deleted_at", null)
        .order("sort_number")
    ),
    safeQuery<{ id: number; name: string }>(
      supabase
        .from("visit_sources")
        .select("id, name")
        .eq("shop_id", shopId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_number")
    ),
    safeQuery<{ id: number; name: string }>(
      supabase
        .from("menu_categories")
        .select("id, name")
        .eq("brand_id", brandId)
        .or(`shop_id.is.null,shop_id.eq.${shopId}`)
        .is("deleted_at", null)
        .order("sort_number")
    ),
    safeQuery<{ id: number; name: string }>(
      supabase
        .from("shops")
        .select("id, name")
        .eq("brand_id", brandId)
        .is("deleted_at", null)
        .order("sort_number", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
    ),
  ]);

  const categoryMap = new Map(categoryData.map((c) => [c.id, c.name]));

  const menus = menuData.map((m) => ({
    menu_manage_id: m.menu_manage_id,
    name: m.name,
    price: m.price,
    duration: m.duration,
    category_name: m.category_id
      ? categoryMap.get(m.category_id) ?? null
      : null,
  }));

  const { data: tagTemplates } = await getTagTemplates(brandId);

  return (
    <div>
      <PageHeader title="強制リンク編集" description={link.title} />
      <div className="p-6">
        <BookingLinkForm
          brandId={brandId}
          shops={shopsData}
          menus={menus}
          visitSources={sourceData}
          tagTemplates={tagTemplates.map((t) => ({ id: t.id, title: t.title }))}
          initialData={link}
        />
      </div>
    </div>
  );
}
