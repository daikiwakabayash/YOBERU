"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";

/**
 * ShopContext — cookie-backed "currently selected shop" for multi-shop
 * operations across the dashboard.
 *
 * Usage (server components / server actions):
 *   import { getActiveShopId, getActiveBrandId } from "@/helper/lib/shop-context";
 *   const shopId = await getActiveShopId();
 *
 * Usage (client components via a form / action):
 *   import { setActiveShopId } from "@/helper/lib/shop-context";
 *   await setActiveShopId(5);
 *
 * The active shop is persisted in a first-party cookie so server-rendered
 * pages can filter data consistently without extra round-trips. Cookies are
 * scoped to the whole site (path: "/") and last 1 year.
 */

// File-local constants. "use server" files may only export async functions,
// so these must not be exported. They're only referenced inside this module.
const ACTIVE_SHOP_COOKIE = "yoberu_active_shop_id";
const ACTIVE_BRAND_COOKIE = "yoberu_active_brand_id";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Read the active brand_id from cookie, falling back to 1 (MVP single
 * brand). In the future this can be derived from the authenticated user.
 */
export async function getActiveBrandId(): Promise<number> {
  const store = await cookies();
  const raw = store.get(ACTIVE_BRAND_COOKIE)?.value;
  const n = Number(raw);
  if (!isNaN(n) && n > 0) return n;
  return 1;
}

/**
 * Read the active shop_id.
 *
 * Resolution order:
 *   1. `yoberu_active_shop_id` cookie
 *   2. The first shop row for the active brand (lowest sort_number, oldest id)
 *   3. 1 (fallback)
 *
 * Resolution is best-effort: database errors (e.g. missing table) fall
 * through to the final fallback rather than throwing, so early pages still
 * render during development.
 */
export async function getActiveShopId(): Promise<number> {
  const store = await cookies();
  const raw = store.get(ACTIVE_SHOP_COOKIE)?.value;
  const cookieVal = Number(raw);
  if (!isNaN(cookieVal) && cookieVal > 0) {
    return cookieVal;
  }

  // No cookie: look up the first shop for the active brand
  try {
    const brandId = await getActiveBrandId();
    const supabase = await createClient();
    const { data } = await supabase
      .from("shops")
      .select("id")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as number;
  } catch {
    // fall through
  }

  return 1;
}

/**
 * Server action: set the active shop. Used by ShopSelector (client).
 * After writing the cookie we revalidate `/` so server components
 * refresh on the next navigation; callers should also trigger
 * `router.refresh()` for the current page.
 */
export async function setActiveShopId(shopId: number): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_SHOP_COOKIE, String(shopId), {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: false,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function setActiveBrandId(brandId: number): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_BRAND_COOKIE, String(brandId), {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: false,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
