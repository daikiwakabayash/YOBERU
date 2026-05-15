import { ShopSelector } from "./ShopSelector";
import { BrandSelector } from "./BrandSelector";
import { MobileSidebar } from "./MobileSidebar";
import { HeaderRefreshButton } from "./HeaderRefreshButton";
import {
  getActiveBrandId,
  getActiveShopId,
  getAccessibleBrands,
} from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";

/**
 * Server component. Fetches the brand's shops list and current active
 * shop, then renders the top-right BrandSelector + ShopSelector. Falls
 * back to a minimal bar when the database isn't reachable.
 *
 * モバイルでは左端にハンバーガーメニュー (MobileSidebar) を表示する。
 */
export async function DashboardHeader() {
  const [brandId, activeShopId, brands] = await Promise.all([
    getActiveBrandId(),
    getActiveShopId(),
    getAccessibleBrands(),
  ]);

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
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-white/95 px-3 backdrop-blur-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500">
        <MobileSidebar />
        {activeShop ? (
          <>
            <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 sm:inline">
              管理中の店舗
            </span>
            <span className="truncate font-bold text-gray-900">{activeShop.name}</span>
          </>
        ) : (
          <span className="truncate text-amber-600">
            店舗未選択。店舗マスターから登録してください。
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <HeaderRefreshButton />
        <BrandSelector brands={brands} activeBrandId={brandId} />
        <ShopSelector shops={shops} activeShopId={activeShopId} />
      </div>
    </header>
  );
}
