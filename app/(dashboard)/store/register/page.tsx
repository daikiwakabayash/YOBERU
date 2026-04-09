import { PageHeader } from "@/components/layout/PageHeader";
import { StoreForm } from "@/feature/store/components/StoreForm";
import { createClient } from "@/helper/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function StoreRegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("id, brand_id, shop_id")
    .eq("auth_id", user.id)
    .single();

  if (!userData) redirect("/login");

  return (
    <div>
      <PageHeader title="店舗登録" description="新しい店舗を登録します" />
      <div className="p-6">
        <StoreForm
          brandId={userData.brand_id}
          areaId={0}
          userId={userData.id}
        />
      </div>
    </div>
  );
}
