import { notFound } from "next/navigation";
import { createClient } from "@/helper/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Phone, Mail, Clock, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

interface PublicShopPageProps {
  params: Promise<{ slug: string }>;
}

interface PublicShop {
  id: number;
  uuid: string;
  brand_id: number;
  name: string;
  address: string | null;
  zip_code: string | null;
  phone_number: string | null;
  email1: string | null;
  line_url: string | null;
  shop_url: string | null;
  nearest_station_access: string | null;
}

interface PublicMenu {
  menu_manage_id: string;
  name: string;
  price: number;
  duration: number;
  category_id: number | null;
}

/**
 * Public shop landing page at /shop/<uuid>
 *
 * Displays shop info + public menus + access info + a booking CTA.
 * No authentication required — exposed via middleware bypass.
 */
export default async function PublicShopPage({ params }: PublicShopPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // Look up shop by uuid
  let shop: PublicShop | null = null;
  try {
    const { data } = await supabase
      .from("shops")
      .select(
        "id, uuid, brand_id, name, address, zip_code, phone_number, email1, line_url, shop_url, nearest_station_access"
      )
      .eq("uuid", slug)
      .eq("is_public", true)
      .is("deleted_at", null)
      .single();
    shop = data as PublicShop | null;
  } catch {
    shop = null;
  }

  if (!shop) notFound();

  // Load public menus (brand-wide or shop-specific)
  let menus: PublicMenu[] = [];
  try {
    const { data } = await supabase
      .from("menus")
      .select("menu_manage_id, name, price, duration, category_id")
      .eq("brand_id", shop.brand_id)
      .or(`shop_id.is.null,shop_id.eq.${shop.id}`)
      .is("deleted_at", null)
      .order("sort_number");
    menus = (data ?? []) as PublicMenu[];
  } catch {
    menus = [];
  }

  // Load categories to group menus
  let categoryMap = new Map<number, string>();
  try {
    const { data } = await supabase
      .from("menu_categories")
      .select("id, name")
      .eq("brand_id", shop.brand_id)
      .is("deleted_at", null)
      .order("sort_number");
    categoryMap = new Map(
      (data ?? []).map((c: { id: number; name: string }) => [c.id, c.name])
    );
  } catch {
    // no categories
  }

  // Group menus by category
  const menuGroups = new Map<string, PublicMenu[]>();
  for (const m of menus) {
    const key = m.category_id
      ? categoryMap.get(m.category_id) ?? "その他"
      : "その他";
    const list = menuGroups.get(key) ?? [];
    list.push(m);
    menuGroups.set(key, list);
  }

  // Find a default booking link for this shop (the first one) for CTA
  let defaultBookingSlug: string | null = null;
  try {
    const { data } = await supabase
      .from("booking_links")
      .select("slug")
      .eq("brand_id", shop.brand_id)
      .or(`shop_id.is.null,shop_id.eq.${shop.id}`)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    defaultBookingSlug = data?.slug ?? null;
  } catch {
    defaultBookingSlug = null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">{shop.name}</h1>
          {shop.address && (
            <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-gray-400" />
              {shop.zip_code && `〒${shop.zip_code} `}
              {shop.address}
            </p>
          )}
          {shop.nearest_station_access && (
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4 text-gray-400" />
              {shop.nearest_station_access}
            </p>
          )}
          {shop.phone_number && (
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <Phone className="h-4 w-4 text-gray-400" />
              <a
                href={`tel:${shop.phone_number}`}
                className="hover:underline"
              >
                {shop.phone_number}
              </a>
            </p>
          )}
          {shop.email1 && (
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <Mail className="h-4 w-4 text-gray-400" />
              {shop.email1}
            </p>
          )}
        </div>
      </div>

      {/* Menus */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-4 text-xl font-bold text-gray-900">メニュー</h2>
        {menuGroups.size === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              公開中のメニューがありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Array.from(menuGroups.entries()).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-bold text-gray-500">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map((m) => (
                    <Card key={m.menu_manage_id}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div>
                          <div className="font-bold text-gray-900">
                            {m.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {m.duration}分
                          </div>
                        </div>
                        <div className="text-lg font-bold text-blue-600">
                          ¥{m.price.toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        {defaultBookingSlug && (
          <div className="mt-8 flex justify-center">
            <a
              href={`/book/${defaultBookingSlug}`}
              className="rounded-full bg-blue-600 px-8 py-3 text-base font-bold text-white shadow hover:bg-blue-700"
            >
              予約する
            </a>
          </div>
        )}

        {shop.line_url && (
          <div className="mt-4 flex justify-center">
            <a
              href={shop.line_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-green-600"
            >
              LINEで問い合わせる
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t bg-white py-6 text-center text-xs text-gray-400">
        {shop.name}
      </footer>
    </div>
  );
}
