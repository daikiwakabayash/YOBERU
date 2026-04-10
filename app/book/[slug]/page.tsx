import { notFound } from "next/navigation";
import { getBookingLinkBySlug } from "@/feature/booking-link/services/getBookingLinks";
import { createClient } from "@/helper/lib/supabase/server";
import { PublicBookingWizard } from "@/feature/booking-link/components/PublicBookingWizard";

export const dynamic = "force-dynamic";

interface PublicBookingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ utm_source?: string }>;
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

export interface PublicShop {
  id: number;
  name: string;
  area_id: number | null;
  zip_code: string | null;
  address: string | null;
  nearest_station_access: string | null;
}

export interface PublicArea {
  id: number;
  name: string;
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: PublicBookingPageProps) {
  const { slug } = await params;
  const { utm_source } = await searchParams;

  const link = await getBookingLinkBySlug(slug);
  if (!link) notFound();

  const supabase = await createClient();

  // Load menus from link's menu_manage_ids
  const menuIds =
    Array.isArray(link.menu_manage_ids) && link.menu_manage_ids.length > 0
      ? link.menu_manage_ids
      : [];

  const menus =
    menuIds.length > 0
      ? await safeQuery<{
          menu_manage_id: string;
          name: string;
          price: number;
          duration: number;
        }>(
          supabase
            .from("menus")
            .select("menu_manage_id, name, price, duration")
            .in("menu_manage_id", menuIds)
            .is("deleted_at", null)
            .order("sort_number")
        )
      : [];

  // Load shops - filtered by brand_id, and if shop_id specified on link, only that one
  let shops: PublicShop[] = [];
  if (link.shop_id) {
    shops = await safeQuery<PublicShop>(
      supabase
        .from("shops")
        .select("id, name, area_id, zip_code, address, nearest_station_access")
        .eq("id", link.shop_id)
        .is("deleted_at", null)
    );
  } else {
    shops = await safeQuery<PublicShop>(
      supabase
        .from("shops")
        .select("id, name, area_id, zip_code, address, nearest_station_access")
        .eq("brand_id", link.brand_id)
        .eq("is_public", true)
        .is("deleted_at", null)
        .order("sort_number")
    );
  }

  // Load areas referenced by shops
  const areaIds = Array.from(
    new Set(shops.map((s) => s.area_id).filter((id): id is number => id != null))
  );
  const areas: PublicArea[] =
    areaIds.length > 0
      ? await safeQuery<PublicArea>(
          supabase
            .from("areas")
            .select("id, name")
            .in("id", areaIds)
            .order("sort_number")
        )
      : [];

  // Load all staffs for the shops (group by shop_id on client)
  const shopIds = shops.map((s) => s.id);
  const staffs =
    shopIds.length > 0
      ? await safeQuery<{ id: number; name: string; shop_id: number }>(
          supabase
            .from("staffs")
            .select("id, name, shop_id")
            .in("shop_id", shopIds)
            .eq("is_public", true)
            .is("deleted_at", null)
            .order("allocate_order", { ascending: true, nullsFirst: false })
        )
      : [];

  return (
    <div className="min-h-screen bg-white">
      <PublicBookingWizard
        link={{
          slug: link.slug,
          title: link.title,
          staff_mode: link.staff_mode,
          require_cancel_policy: link.require_cancel_policy,
          cancel_policy_text: link.cancel_policy_text,
          show_line_button: link.show_line_button,
          line_button_text: link.line_button_text,
          line_button_url: link.line_button_url,
          alias_menu_name: link.alias_menu_name,
        }}
        areas={areas}
        shops={shops}
        staffs={staffs}
        menus={menus}
        utmSource={utm_source ?? null}
      />
    </div>
  );
}
