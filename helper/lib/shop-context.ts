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
 * Read the active brand_id.
 *
 * Resolution order:
 *   1. limited ユーザー (users.brand_id IS NOT NULL): 自分の brand_id を強制
 *      (cookie の値は無視 = 他ブランドを見られないようにする)
 *   2. root ユーザー: `yoberu_active_brand_id` cookie
 *   3. cookie が無ければ最初のブランドの id
 *   4. それも無ければ 1
 *
 * DB エラー時は cookie / fallback の組み合わせで最終的に 1 を返す。
 */
export async function getActiveBrandId(): Promise<number> {
  const store = await cookies();

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser?.email) {
      const { data: me } = await supabase
        .from("users")
        .select("brand_id")
        .eq("email", authUser.email)
        .maybeSingle();
      if (me && me.brand_id != null) {
        // limited ユーザーは自分のブランドに固定
        return me.brand_id as number;
      }
    }
  } catch {
    // フォールスルー
  }

  const raw = store.get(ACTIVE_BRAND_COOKIE)?.value;
  const n = Number(raw);
  if (!isNaN(n) && n > 0) return n;

  // cookie 未設定の root: 最初の brand を返す
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("brands")
      .select("id")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as number;
  } catch {
    /* fall through */
  }

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
  // 認可: 現ユーザーがこの brand_id にアクセスできるか確認
  // root (users.brand_id IS NULL) は全 OK、それ以外は自分の brand_id のみ。
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser?.email) {
      const { data } = await supabase
        .from("users")
        .select("brand_id")
        .eq("email", authUser.email)
        .maybeSingle();
      if (data && data.brand_id != null && data.brand_id !== brandId) {
        // limited ユーザーが他ブランドに切り替えようとした → 拒否
        throw new Error("このブランドにアクセスする権限がありません");
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("アクセスする権限")) {
      throw e;
    }
    // それ以外 (DB 接続エラー等) はフォールスルー
  }

  store.set(ACTIVE_BRAND_COOKIE, String(brandId), {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: false,
    sameSite: "lax",
  });
  // ブランド切替時は店舗 cookie をクリア。getActiveShopId() の
  // 「ブランド配下の最初の店舗を自動選択」フォールバックが効く。
  store.delete(ACTIVE_SHOP_COOKIE);
  revalidatePath("/", "layout");
}

/**
 * 現ユーザーが切り替え可能なブランド一覧を返す。
 *   - root (users.brand_id IS NULL): 全ブランド
 *   - limited (users.brand_id = X):  X 1 件のみ
 *
 * UI 側はこの結果が 2 件以上のときだけ BrandSelector を出す想定。
 */
export async function getAccessibleBrands(): Promise<
  Array<{ id: number; name: string }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.email) return [];

    const { data: me } = await supabase
      .from("users")
      .select("brand_id")
      .eq("email", authUser.email)
      .maybeSingle();
    if (!me) return [];

    const query = supabase
      .from("brands")
      .select("id, name")
      .is("deleted_at", null)
      .order("id", { ascending: true });
    const { data } = me.brand_id == null ? await query : await query.eq("id", me.brand_id);
    return (data ?? []).map((b) => ({
      id: b.id as number,
      name: (b.name as string) ?? "",
    }));
  } catch {
    return [];
  }
}
