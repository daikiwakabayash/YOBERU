import { ShopSelector } from "./ShopSelector";
import { getActiveBrandId, getActiveShopId } from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";

/**
 * Server component. Fetches the brand's shops list and current active
 * shop, then renders the top-right ShopSelector. Falls back to a minimal
 * bar when the database isn't reachable.
 */
export async function DashboardHeader() {
  const brandId = await getActiveBrandId();
  const activeShopId = await getActiveShopId();

  let shops: Array<{ id: number; name: string }> = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("shops")
      .select("id, name")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
    shops = data ?? [];
  } catch {
    shops = [];
  }

  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-white/95 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {activeShop ? (
          <>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              管理中の店舗
            </span>
            <span className="font-bold text-gray-900">{activeShop.name}</span>
          </>
        ) : (
          <span className="text-amber-600">
            店舗が選択されていません。店舗マスターから登録してください。
          </span>
        )}
      </div>
      <ShopSelector shops={shops} activeShopId={activeShopId} />
    </header>
  );
}
