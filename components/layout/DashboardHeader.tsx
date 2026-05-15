import { ShopSelector } from "./ShopSelector";
import { BrandSelector } from "./BrandSelector";
import { MobileSidebar } from "./MobileSidebar";
import { HeaderRefreshButton } from "./HeaderRefreshButton";
import { LogoutButton } from "./LogoutButton";
import { getActiveBrandId, getActiveShopId } from "@/helper/lib/shop-context";
import { createClient } from "@/helper/lib/supabase/server";

/**
 * Server component. Fetches the brand's shops list and current active
 * shop, then renders the top-right ShopSelector. Falls back to a minimal
 * bar when the database isn't reachable.
 *
 * モバイルでは左端にハンバーガーメニュー (MobileSidebar) を表示する。
 */
export async function DashboardHeader() {
  const brandId = await getActiveBrandId();
  const activeShopId = await getActiveShopId();

  let shops: Array<{ id: number; name: string }> = [];
  let brands: Array<{ id: number; name: string }> = [];
  let isRoot = false;

  // デバッグ用: 現在のログインユーザー情報
  let debugEmail: string | null = null;
  let debugUserExists = false;
  let debugBrandIdInDb: number | null = null;
  let debugBrandCount = 0;

  try {
    const supabase = await createClient();
    const { data: shopRows } = await supabase
      .from("shops")
      .select("id, name")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
    shops = shopRows ?? [];

    // root 判定 (users.brand_id IS NULL) してブランドセレクタを出すか決める
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      debugEmail = user.email;
      const { data: u } = await supabase
        .from("users")
        .select("brand_id")
        .eq("email", user.email)
        .maybeSingle();
      if (u) {
        debugUserExists = true;
        debugBrandIdInDb = (u.brand_id as number | null) ?? null;
        if (u.brand_id == null) isRoot = true;
      }
    }

    // ブランドは root 限定でなく常時取得 (デバッグ表示用に件数を出す)
    const { data: brandRows } = await supabase
      .from("brands")
      .select("id, name")
      .is("deleted_at", null)
      .order("id", { ascending: true });
    const allBrands = brandRows ?? [];
    debugBrandCount = allBrands.length;
    if (isRoot) {
      brands = allBrands;
    }
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
        {/* DEBUG: ログイン中ユーザーの状態 (root 判定が効かない時の切り分け用) */}
        <div
          className="hidden items-center gap-1.5 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-mono text-amber-800 sm:inline-flex"
          title="DEBUG: ログイン中ユーザー / DB の brand_id / 全ブランド件数"
        >
          <span className="font-bold">DBG</span>
          <span>
            {debugEmail ?? "未ログイン"}
            {" | "}
            DB:{debugUserExists ? (debugBrandIdInDb == null ? "root" : `brand=${debugBrandIdInDb}`) : "未登録"}
            {" | "}
            判定:{isRoot ? "root" : "brand"}
            {" | "}
            活性brand={brandId}
            {" | "}
            全brand={debugBrandCount}
          </span>
        </div>
        <HeaderRefreshButton />
        {isRoot && brands.length > 0 ? (
          <BrandSelector brands={brands} activeBrandId={brandId} />
        ) : null}
        <ShopSelector shops={shops} activeShopId={activeShopId} />
        <LogoutButton />
      </div>
    </header>
  );
}
