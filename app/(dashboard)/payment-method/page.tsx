import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentMethodList } from "@/feature/payment-method/components/PaymentMethodList";
import { getPaymentMethods } from "@/feature/payment-method/services/getPaymentMethods";

const SHOP_ID = 1;
const BRAND_ID = 1;

export default async function PaymentMethodPage() {
  const methods = await getPaymentMethods(SHOP_ID);

  return (
    <div>
      <PageHeader
        title="支払方法マスター"
        description="予約時の支払方法ボタンに表示される選択肢を管理します"
      />
      <div className="p-6">
        <PaymentMethodList methods={methods} shopId={SHOP_ID} brandId={BRAND_ID} />
      </div>
    </div>
  );
}
