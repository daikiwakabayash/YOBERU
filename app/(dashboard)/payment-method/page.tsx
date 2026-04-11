import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentMethodList } from "@/feature/payment-method/components/PaymentMethodList";
import { getPaymentMethods } from "@/feature/payment-method/services/getPaymentMethods";
import { SetupRequiredNotice } from "@/feature/booking-link/components/SetupRequiredNotice";
import { createClient } from "@/helper/lib/supabase/server";
import {
  getActiveShopId,
  getActiveBrandId,
} from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function PaymentMethodPage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // Check if table exists by doing a probe query
  const supabase = await createClient();
  let setupRequired = false;
  try {
    const probe = await supabase
      .from("payment_methods")
      .select("id")
      .limit(1);
    if (probe.error) {
      const msg = String(probe.error.message ?? "");
      if (
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        probe.error.code === "42P01" ||
        probe.error.code === "PGRST205"
      ) {
        setupRequired = true;
      }
    }
  } catch {
    setupRequired = true;
  }

  if (setupRequired) {
    return (
      <div>
        <PageHeader
          title="支払方法マスター"
          description="予約時の支払方法ボタンに表示される選択肢を管理します"
        />
        <div className="p-6">
          <SetupRequiredNotice />
        </div>
      </div>
    );
  }

  const methods = await getPaymentMethods(shopId);

  return (
    <div>
      <PageHeader
        title="支払方法マスター"
        description="予約時の支払方法ボタンに表示される選択肢を管理します"
      />
      <div className="p-6">
        <PaymentMethodList methods={methods} shopId={shopId} brandId={brandId} />
      </div>
    </div>
  );
}
