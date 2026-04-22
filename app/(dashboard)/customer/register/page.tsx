import { PageHeader } from "@/components/layout/PageHeader";
import { StaffQuestionnaireRegister } from "@/feature/customer/components/StaffQuestionnaireRegister";
import { getStaffs } from "@/feature/staff/services/getStaffs";
import { getQuestionnaires } from "@/feature/questionnaire/services/getQuestionnaires";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function CustomerRegisterPage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  let staffs: { id: number; name: string }[] = [];
  try {
    const staffData = await getStaffs(shopId);
    staffs = staffData.map((s: { id: number; name: string }) => ({
      id: s.id,
      name: s.name,
    }));
  } catch {
    // If fetching fails, show form with empty staff list
  }

  // 問診票テンプレ (ブランド共通 + 該当店舗専用) を取得。スタッフ登録
  // フォームは原則これで置き換え、同じ項目セットで回答が蓄積される。
  const { data: allQuestionnaires } = await getQuestionnaires(brandId);
  const questionnaires = allQuestionnaires.filter(
    (q) => q.shop_id == null || q.shop_id === shopId
  );

  return (
    <div>
      <PageHeader
        title="顧客登録"
        description="電話ヒアリング等、問診票リンクを使えないお客様向け。カルテ No は保存時に自動で採番されます (未使用の最小番号から)。"
      />
      <div className="p-6">
        <StaffQuestionnaireRegister
          brandId={brandId}
          shopId={shopId}
          staffs={staffs}
          questionnaires={questionnaires}
        />
      </div>
    </div>
  );
}
