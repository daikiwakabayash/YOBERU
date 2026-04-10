import { notFound } from "next/navigation";
import { getBookingLinkBySlug } from "@/feature/booking-link/services/getBookingLinks";
import { createClient } from "@/helper/lib/supabase/server";
import { PublicBookingForm } from "@/feature/booking-link/components/PublicBookingForm";

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

export default async function PublicBookingPage({
  params,
  searchParams,
}: PublicBookingPageProps) {
  const { slug } = await params;
  const { utm_source } = await searchParams;

  const link = await getBookingLinkBySlug(slug);
  if (!link) notFound();

  const supabase = await createClient();

  // Load menus from the link's menu_manage_ids
  const menuIds =
    Array.isArray(link.menu_manage_ids) && link.menu_manage_ids.length > 0
      ? link.menu_manage_ids
      : [];

  const menus = menuIds.length > 0
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

  // Load shop info (single row query)
  let shop: { id: number; name: string } | null = null;
  try {
    const { data } = await supabase
      .from("shops")
      .select("id, name")
      .eq("id", link.shop_id ?? 1)
      .is("deleted_at", null)
      .single();
    shop = data;
  } catch {
    shop = null;
  }

  // Load staffs (if staff designation is allowed)
  const staffs =
    link.staff_mode !== 2 && shop
      ? await safeQuery<{ id: number; name: string }>(
          supabase
            .from("staffs")
            .select("id, name")
            .eq("shop_id", shop.id)
            .eq("is_public", true)
            .is("deleted_at", null)
            .order("allocate_order", { ascending: true, nullsFirst: false })
        )
      : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {link.alias_menu_name ?? link.title}
          </h1>
          {shop && (
            <p className="mt-1 text-sm text-gray-600">{shop.name}</p>
          )}
        </div>

        {/* Form */}
        <PublicBookingForm
          link={{
            slug: link.slug,
            title: link.title,
            staff_mode: link.staff_mode,
            require_cancel_policy: link.require_cancel_policy,
            cancel_policy_text: link.cancel_policy_text,
            show_line_button: link.show_line_button,
            line_button_text: link.line_button_text,
            line_button_url: link.line_button_url,
          }}
          shopId={shop?.id ?? link.shop_id ?? 1}
          menus={menus}
          staffs={staffs}
          utmSource={utm_source ?? null}
        />
      </div>
    </div>
  );
}
