import { notFound } from "next/navigation";
import { getBookingLinkBySlug } from "@/feature/booking-link/services/getBookingLinks";
import { getShopAvailability } from "@/feature/booking-link/services/getShopAvailability";
import { getShopStaffFreeSlots } from "@/feature/booking-link/services/getShopStaffFreeSlots";
import { getTagTemplatesByIds } from "@/feature/tag-template/services/getTagTemplates";
import { TagInjector } from "@/feature/tag-template/components/TagInjector";
import { createClient } from "@/helper/lib/supabase/server";
import { PublicBookingWizard } from "@/feature/booking-link/components/PublicBookingWizard";

export const dynamic = "force-dynamic";

interface PublicBookingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ utm_source?: string; lang?: string }>;
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
  logo_url: string | null;
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
  const { utm_source, lang: langParam } = await searchParams;

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

  // Load shops. Resolution priority:
  //   1. link.shop_ids (multi-shop, post-migration 00008) → only those
  //   2. link.shop_id (legacy single-shop) → only that shop
  //   3. fallback → all is_public shops in the brand
  let shops: PublicShop[] = [];
  const linkShopIds: number[] =
    Array.isArray(link.shop_ids) && link.shop_ids.length > 0
      ? link.shop_ids
      : [];
  if (linkShopIds.length > 0) {
    shops = await safeQuery<PublicShop>(
      supabase
        .from("shops")
        .select("id, name, area_id, zip_code, address, nearest_station_access, logo_url")
        .in("id", linkShopIds)
        .eq("is_public", true)
        .is("deleted_at", null)
        .order("sort_number")
    );
  } else if (link.shop_id) {
    shops = await safeQuery<PublicShop>(
      supabase
        .from("shops")
        .select("id, name, area_id, zip_code, address, nearest_station_access, logo_url")
        .eq("id", link.shop_id)
        .is("deleted_at", null)
    );
  } else {
    shops = await safeQuery<PublicShop>(
      supabase
        .from("shops")
        .select("id, name, area_id, zip_code, address, nearest_station_access, logo_url")
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

  // Resolve language: explicit ?lang=… wins, otherwise fall back to the
  // booking link's stored `language` (defaults to "ja").
  const initialLang: "ja" | "en" =
    langParam === "en" ? "en" : langParam === "ja" ? "ja" : link.language === "en" ? "en" : "ja";

  // Pre-compute the open / closed availability for each shop the link
  // can resolve to, for the next ~6 weeks. The wizard uses this to mark
  // closed dates as "−" and slots outside the open window as "×".
  // Resolved per shop_id and merged so multi-shop links show the union.
  const today = new Date();
  const startStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const future = new Date(today);
  future.setDate(future.getDate() + 6 * 7);
  const endStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

  const availabilityByShop: Record<
    number,
    Awaited<ReturnType<typeof getShopAvailability>>
  > = {};
  const staffFreeByShop: Record<
    number,
    Awaited<ReturnType<typeof getShopStaffFreeSlots>>
  > = {};
  for (const s of shops) {
    try {
      availabilityByShop[s.id] = await getShopAvailability(
        s.id,
        startStr,
        endStr
      );
    } catch (e) {
      console.error("[book/[slug]] availability fetch failed", e);
      availabilityByShop[s.id] = {};
    }
    try {
      staffFreeByShop[s.id] = await getShopStaffFreeSlots(
        s.id,
        startStr,
        endStr
      );
    } catch (e) {
      console.error("[book/[slug]] staff free slots fetch failed", e);
      staffFreeByShop[s.id] = {};
    }
  }

  // Resolve tag templates (GTM etc.) attached to this booking link, if any.
  // Both head/body columns are nullable (00023). Pre-migration rows have
  // them normalized to null in getBookingLinkBySlug.
  const tagTemplateIds = [
    link.head_tag_template_id,
    link.body_tag_template_id,
  ].filter((id): id is number => typeof id === "number" && id > 0);
  const tagTemplates =
    tagTemplateIds.length > 0
      ? await getTagTemplatesByIds(tagTemplateIds)
      : [];
  const tagById = new Map(tagTemplates.map((t) => [t.id, t.content]));
  const headTagHtml = link.head_tag_template_id
    ? tagById.get(link.head_tag_template_id) ?? ""
    : "";
  const bodyTagHtml = link.body_tag_template_id
    ? tagById.get(link.body_tag_template_id) ?? ""
    : "";

  return (
    <div className="min-h-screen bg-white">
      {headTagHtml && <TagInjector target="head" html={headTagHtml} />}
      {bodyTagHtml && <TagInjector target="body" html={bodyTagHtml} />}
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
          public_notice: link.public_notice ?? null,
        }}
        areas={areas}
        shops={shops}
        staffs={staffs}
        menus={menus}
        utmSource={utm_source ?? null}
        lang={initialLang}
        availabilityByShop={availabilityByShop}
        staffFreeByShop={staffFreeByShop}
      />
    </div>
  );
}
