import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/helper/lib/supabase/server";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { getSegmentCustomers } from "@/feature/reengagement/services/getSegmentCustomers";
import { getTemplatesForShop } from "@/feature/reengagement/services/getTemplates";
import { ReengagementDashboard } from "@/feature/reengagement/components/ReengagementDashboard";
import { ALL_SEGMENTS } from "@/feature/reengagement/types";

export const dynamic = "force-dynamic";

export default async function ReengagementPage() {
  const brandId = await getActiveBrandId();
  const shopId = await getActiveShopId();

  // テンプレートを先に引く (cooldown_days が顧客抽出側の cooldown 表示に影響)
  const templates = await getTemplatesForShop(brandId, shopId);

  // 3 セグメントの候補顧客を並列取得
  const [first30, dormant60, planExpired] = await Promise.all(
    ALL_SEGMENTS.map((seg) =>
      getSegmentCustomers(shopId, seg, templates[seg].cooldownDays)
    )
  );

  // クーポン候補メニュー (plan_type=ticket のもの) 一覧
  const supabase = await createClient();
  const { data: ticketMenus } = await supabase
    .from("menus")
    .select("menu_manage_id, name, price, ticket_count")
    .eq("brand_id", brandId)
    .or(`shop_id.is.null,shop_id.eq.${shopId}`)
    .eq("plan_type", "ticket")
    .is("deleted_at", null)
    .order("sort_number");

  return (
    <div>
      <PageHeader
        title="再来店促進"
        description="休眠リスクのあるお客様に LINE / メールで自動配信できます。"
      />
      <div className="p-6">
        <ReengagementDashboard
          brandId={brandId}
          shopId={shopId}
          templates={templates}
          segmentCustomers={{
            first_visit_30d: first30,
            dormant_60d: dormant60,
            plan_expired: planExpired,
          }}
          couponMenus={
            (ticketMenus ?? []).map((m) => ({
              menu_manage_id: m.menu_manage_id as string,
              name: m.name as string,
              price: m.price as number,
              ticket_count: (m.ticket_count as number | null) ?? 1,
            })) ?? []
          }
        />
      </div>
    </div>
  );
}
