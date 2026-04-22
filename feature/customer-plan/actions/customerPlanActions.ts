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
  // ticket / subscription どちらも ticket_count を拾う。
  //   ticket       : 購入時点の総回数 (4 回券 → 4)
  //   subscription : 1 サイクル (1 ヶ月) あたりの利用回数 (月 4 回制限 → 4)
  //                  NULL なら無制限サブスク
  const totalCount = (menu.ticket_count as number | null) ?? null;

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
  //    消化額も合わせて stamp する (migration 00029)。
  if (input.appointmentId) {
    const apptUpdate: Record<string, unknown> = { is_member_join: true };
    if (planType === "ticket" && input.consumeToday) {
      apptUpdate.consumed_plan_id = inserted.id;
      apptUpdate.consumed_amount = computePerVisitConsumedAmount({
        planType: "ticket",
        priceSnapshot: menu.price as number,
        totalCount,
        nextUsedCount: 1,
      });
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

  // 既に別のプランを消化していたら revert する (used_count と consumed_amount 両方)
  const { data: current } = await supabase
    .from("appointments")
    .select("consumed_plan_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (current?.consumed_plan_id && current.consumed_plan_id !== customerPlanId) {
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

  // 新プランの情報を取得 (消化額計算に必要)
  const { data: plan } = await supabase
    .from("customer_plans")
    .select("plan_type, used_count, total_count, price_snapshot")
    .eq("id", customerPlanId)
    .maybeSingle();

  // used_count を +1 (ticket のみ)。残数 0 になったら status=1 (exhausted)。
  let nextUsedCount = 1;
  if (plan?.plan_type === "ticket") {
    nextUsedCount = (plan.used_count ?? 0) + 1;
    const exhausted =
      plan.total_count != null && nextUsedCount >= (plan.total_count as number);
    await supabase
      .from("customer_plans")
      .update({ used_count: nextUsedCount, status: exhausted ? 1 : 0 })
      .eq("id", customerPlanId);
  } else if (plan?.plan_type === "subscription") {
    // サブスクも月あたり利用回数があれば +1 する (無制限なら触らない)
    if (plan.total_count != null) {
      nextUsedCount = (plan.used_count ?? 0) + 1;
      await supabase
        .from("customer_plans")
        .update({ used_count: nextUsedCount })
        .eq("id", customerPlanId);
    }
  }

  // 消化額を計算して appointment に stamp
  const consumedAmount = plan
    ? computePerVisitConsumedAmount({
        planType: plan.plan_type as "ticket" | "subscription",
        priceSnapshot: plan.price_snapshot as number,
        totalCount: (plan.total_count as number | null) ?? null,
        nextUsedCount,
      })
    : 0;

  const { error: apptErr } = await supabase
    .from("appointments")
    .update({
      consumed_plan_id: customerPlanId,
      consumed_amount: consumedAmount,
    })
    .eq("id", appointmentId);
  if (apptErr) return { error: apptErr.message };

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

/**
 * used_count を直接書き換える (手動修正用)。
 * 入力ミスの訂正や、過去予約分の反映漏れを手動で直すときに使う。
 *
 * - ticket で total_count != null のときは 0 <= value <= total_count にクランプ
 * - サブスクは 0 以上で自由
 * - 残 0 の ticket は status=1 に、残 >0 なら status=0 に自動遷移
 */
export async function setPlanUsedCount(planId: number, nextValue: number) {
  const supabase = await createClient();

  const { data: plan, error: fetchErr } = await supabase
    .from("customer_plans")
    .select("plan_type, total_count, used_count")
    .eq("id", planId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr.message };
  if (!plan) return { error: "プランが見つかりません" };

  let v = Math.max(0, Math.floor(nextValue));
  if (plan.plan_type === "ticket" && plan.total_count != null) {
    v = Math.min(v, plan.total_count as number);
  }

  const exhausted =
    plan.plan_type === "ticket" &&
    plan.total_count != null &&
    v >= (plan.total_count as number);

  const { error } = await supabase
    .from("customer_plans")
    .update({ used_count: v, status: exhausted ? 1 : 0 })
    .eq("id", planId);
  if (error) return { error: error.message };

  revalidatePath("/customer");
  revalidatePath("/reservation");
  return { success: true, usedCount: v };
}

/** used_count を +/- delta で増減させる (ボタン操作用の薄いラッパ) */
export async function adjustPlanUsedCount(planId: number, delta: number) {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("customer_plans")
    .select("used_count")
    .eq("id", planId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!plan) return { error: "プランが見つかりません" };
  return setPlanUsedCount(planId, (plan.used_count ?? 0) + delta);
}

function oneMonthLater(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 1 予約あたりの消化額を計算する。
 *
 * - ticket: 基本は floor(price / total_count)。ただし「最終回」
 *   (nextUsedCount === total_count) だけは端数を吸収させ、
 *   合計が price_snapshot と一致するようにする。
 *     例) 10,000 円 3 回券 → 3,333 / 3,333 / 3,334
 * - subscription: 毎回 floor(price / total_count) を計上 (サブスクは
 *   月次でリセットされるので「最終回」の概念は無い)。
 *   total_count が NULL の無制限サブスクは 0 (消化額を機械的に
 *   割り出せないため)。
 */
export function computePerVisitConsumedAmount(args: {
  planType: "ticket" | "subscription";
  priceSnapshot: number;
  totalCount: number | null;
  nextUsedCount: number;
}): number {
  const { planType, priceSnapshot, totalCount, nextUsedCount } = args;
  if (!priceSnapshot || priceSnapshot <= 0) return 0;
  if (!totalCount || totalCount <= 0) return 0;

  const perVisit = Math.floor(priceSnapshot / totalCount);
  if (planType === "ticket" && nextUsedCount >= totalCount) {
    // 最終回: 残り全額を乗せる
    return priceSnapshot - perVisit * (totalCount - 1);
  }
  return perVisit;
}
