"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface PurchasePlanInput {
  brandId: number;
  shopId: number;
  customerId: number;
  menuManageId: string;
  /** 今日を 1 回目として消化するか (ticket のときだけ意味がある) */
  consumeToday: boolean;
  /** 購入のトリガーとなった予約 (あれば consumed_plan_id を立てる) */
  appointmentId: number | null;
}

/**
 * 顧客がプラン (チケット / サブスク) を購入したことを記録する。
 *
 * 振る舞い:
 *   - customer_plans に 1 行作る
 *   - appointmentId が渡され、かつ consumeToday=true かつ チケット型なら、
 *     その appointment を「この plan を 1 回消化した予約」として紐付け、
 *     used_count を 1 にする。
 *   - 併せて appointment.is_member_join=true を立て、マーケティングの
 *     入会率分子にカウントされるようにする。
 *
 * エラー処理:
 *   - menus が見つからない / plan_type が NULL ならエラー。
 *   - 失敗したら { error: string } を返す。
 */
export async function purchaseCustomerPlan(input: PurchasePlanInput) {
  const supabase = await createClient();

  // 1. 対象メニューを検証 (plan_type / ticket_count / 金額のスナップショット用)
  const { data: menu, error: menuErr } = await supabase
    .from("menus")
    .select("menu_manage_id, name, price, plan_type, ticket_count")
    .eq("menu_manage_id", input.menuManageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (menuErr) return { error: menuErr.message };
  if (!menu) return { error: "プランメニューが見つかりません" };
  if (!menu.plan_type) {
    return { error: "このメニューはプランとして登録されていません" };
  }

  const planType = menu.plan_type as "ticket" | "subscription";
  const totalCount =
    planType === "ticket" ? (menu.ticket_count as number | null) : null;

  // 2. customer_plans に INSERT
  const initialUsedCount =
    planType === "ticket" && input.consumeToday && input.appointmentId ? 1 : 0;

  const nextBillingDate = planType === "subscription" ? oneMonthLater() : null;

  const { data: inserted, error: insertErr } = await supabase
    .from("customer_plans")
    .insert({
      brand_id: input.brandId,
      shop_id: input.shopId,
      customer_id: input.customerId,
      menu_manage_id: menu.menu_manage_id,
      menu_name_snapshot: menu.name,
      price_snapshot: menu.price,
      plan_type: planType,
      total_count: totalCount,
      used_count: initialUsedCount,
      purchased_appointment_id: input.appointmentId,
      next_billing_date: nextBillingDate,
      status: 0,
    })
    .select("id")
    .single();
  if (insertErr) return { error: insertErr.message };

  // 3. 今日を 1 回目として使う場合は appointment に consumed_plan_id を貼る。
  //    併せて is_member_join=true にしてマーケティング入会率に反映。
  if (input.appointmentId) {
    const apptUpdate: Record<string, unknown> = { is_member_join: true };
    if (planType === "ticket" && input.consumeToday) {
      apptUpdate.consumed_plan_id = inserted.id;
    }
    const { error: apptErr } = await supabase
      .from("appointments")
      .update(apptUpdate)
      .eq("id", input.appointmentId);
    if (apptErr) {
      console.error("[purchaseCustomerPlan] appointment update failed", apptErr);
      // 予約側の更新失敗は致命ではないので落とさない
    }
  }

  revalidatePath("/reservation");
  revalidatePath("/customer");
  return { success: true, planId: inserted.id as number };
}

/**
 * ある予約に、対象顧客の既存チケットを 1 回消化として紐付ける。
 * 既に consumed_plan_id が入っている場合は上書きする。
 *
 * 来店カウントやチケット消化の整合は以下で担保する:
 *   - 来院: completeAppointment 側で is_continued_billing=false のときに加算
 *   - チケット消化: ここで used_count を +1 する (サブスクは +1 しない)
 */
export async function consumeCustomerPlan(
  appointmentId: number,
  customerPlanId: number
) {
  const supabase = await createClient();

  // 既に別のプランを消化していたら revert する
  const { data: current } = await supabase
    .from("appointments")
    .select("consumed_plan_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (current?.consumed_plan_id && current.consumed_plan_id !== customerPlanId) {
    await supabase.rpc;
    // used_count を 1 減らす (revert)
    const { data: prev } = await supabase
      .from("customer_plans")
      .select("used_count")
      .eq("id", current.consumed_plan_id)
      .maybeSingle();
    if (prev) {
      await supabase
        .from("customer_plans")
        .update({ used_count: Math.max(0, (prev.used_count ?? 1) - 1) })
        .eq("id", current.consumed_plan_id);
    }
  }

  // 新プランを appointment に紐付け
  const { error: apptErr } = await supabase
    .from("appointments")
    .update({ consumed_plan_id: customerPlanId })
    .eq("id", appointmentId);
  if (apptErr) return { error: apptErr.message };

  // used_count を +1 (ticket のみ)。残数 0 になったら status=1 (exhausted)。
  const { data: plan } = await supabase
    .from("customer_plans")
    .select("plan_type, used_count, total_count")
    .eq("id", customerPlanId)
    .maybeSingle();
  if (plan?.plan_type === "ticket") {
    const nextUsed = (plan.used_count ?? 0) + 1;
    const exhausted =
      plan.total_count != null && nextUsed >= (plan.total_count as number);
    await supabase
      .from("customer_plans")
      .update({ used_count: nextUsed, status: exhausted ? 1 : 0 })
      .eq("id", customerPlanId);
  }

  revalidatePath("/reservation");
  return { success: true };
}

/**
 * 顧客保有プランをソフトデリートする。
 *
 * 誤購入やテストデータの取り消しを想定。`deleted_at` にタイムスタンプを
 * 立てるだけで、`consumed_plan_id` で参照している既存の予約 (= 既に
 * 消化済みの履歴) には触らない。履歴保全を優先する方針。
 */
export async function deleteCustomerPlan(customerPlanId: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("customer_plans")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customerPlanId);
  if (error) return { error: error.message };

  revalidatePath("/reservation");
  revalidatePath("/customer");
  return { success: true };
}

function oneMonthLater(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
