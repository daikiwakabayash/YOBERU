import { PageHeader } from "@/components/layout/PageHeader";
import { StoreForm } from "@/feature/store/components/StoreForm";
import { createClient } from "@/helper/lib/supabase/server";
import { getActiveBrandId } from "@/helper/lib/shop-context";

// TODO: userId should come from the authenticated session once users.auth_id
// column is added. Using 1 as a placeholder.
const USER_ID = 1;

export const dynamic = "force-dynamic";

export default async function StoreRegisterPage() {
  const brandId = await getActiveBrandId();
  const supabase = await createClient();

  // Load areas for the selector
  let areas: Array<{ id: number; name: string }> = [];
  try {
    const { data } = await supabase
      .from("areas")
      .select("id, name")
      .eq("brand_id", brandId)
      .order("sort_number");
    areas = data ?? [];
  } catch {
    areas = [];
  }

  return (
    <div>
      <PageHeader title="店舗登録" description="新しい店舗を登録します" />
      <div className="p-6">
        <StoreForm
          brandId={brandId}
          userId={USER_ID}
          areas={areas}
        />
      </div>
    </div>
  );
}
