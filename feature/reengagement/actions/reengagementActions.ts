"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/helper/lib/email/sendEmail";
import type { ReengagementSegment } from "../types";

/**
 * 再来店促進キャンペーンは email 固定で配信する。LINE の自動送信は
 * 誤送信防止の観点から「予約リマインド (cron)」だけに限定する方針のため、
 * 顧客に LINE 紐付けがあっても利用しない。LINE でフォローアップを
 * 送りたい場合は /line-chat からスタッフが手動で個別送信すること。
 */

// ---------------------------------------------------------------------------
// テンプレート CRUD
// ---------------------------------------------------------------------------

export interface SaveTemplateInput {
  brandId: number;
  shopId: number | null;
  segment: ReengagementSegment;
  title: string;
  message: string;
  couponMenuManageId: string | null;
  cooldownDays: number;
  autoSendEnabled: boolean;
}

/**
 * テンプレートを保存する (brand, shop, segment) 単位で upsert。
 * 同スコープの既存 active テンプレは deleted_at を立ててから挿入する
 * (履歴を残したい将来用 + UNIQUE 制約回避)。
 */
export async function saveReengagementTemplate(input: SaveTemplateInput) {
  const supabase = await createClient();

  // 既存 active を soft-delete
  const existingQuery = supabase
    .from("reengagement_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("brand_id", input.brandId)
    .eq("segment", input.segment)
    .is("deleted_at", null);
  if (input.shopId == null) {
    existingQuery.is("shop_id", null);
  } else {
    existingQuery.eq("shop_id", input.shopId);
  }
  await existingQuery;

  const insertRow: Record<string, unknown> = {
    brand_id: input.brandId,
    shop_id: input.shopId,
    segment: input.segment,
    title: input.title,
    message: input.message,
    coupon_menu_manage_id: input.couponMenuManageId,
    cooldown_days: input.cooldownDays,
    auto_send_enabled: input.autoSendEnabled,
    is_active: true,
  };
  let { error } = await supabase
    .from("reengagement_templates")
    .insert(insertRow);
  // auto_send_enabled 未適用環境へのフォールバック (migration 00027 前)
  if (error && error.message?.includes("auto_send_enabled")) {
    const fallback = { ...insertRow };
    delete fallback.auto_send_enabled;
    const retry = await supabase
      .from("reengagement_templates")
      .insert(fallback);
    error = retry.error;
  }
  if (error) return { error: error.message };

  revalidatePath("/reengagement");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 配信アクション
// ---------------------------------------------------------------------------

export interface SendCampaignInput {
  brandId: number;
  shopId: number;
  segment: ReengagementSegment;
  /** 実際に送信する顧客 ID の明示リスト。UI で unchecked を弾いた後の集合。 */
  customerIds: number[];
}

export interface SendCampaignResult {
  sent: number;
  skippedCooldown: number;
  skippedNoContact: number;
  failed: number;
  couponsIssued: number;
  error?: string;
}

/**
 * 指定セグメントに該当する customers へ一斉配信する。
 *
 * 動作:
 *   1. テンプレート (title / message / coupon / cooldown) を引く
 *   2. 配信対象の各顧客について:
 *      a. 直近 cooldown_days 内に同セグメントで送信済なら skip
 *      b. クーポン menu_manage_id が指定されていれば customer_plans に
 *         1 回限定チケットを発行
 *      c. email で送信 (LINE 自動送信は予約リマインドのみに限定する方針
 *         のため、LINE 紐付けがあっても利用しない)。email が未登録なら
 *         skipped_no_contact。
 *      d. reengagement_logs に結果を INSERT
 *   3. 集計を返す
 */
export async function sendReengagementCampaign(
  input: SendCampaignInput
): Promise<SendCampaignResult> {
  const supabase = await createClient();

  // テンプレート取得 (shop 優先 → brand 共通)
  const { data: tmplRows } = await supabase
    .from("reengagement_templates")
    .select("*")
    .eq("brand_id", input.brandId)
    .eq("segment", input.segment)
    .or(`shop_id.is.null,shop_id.eq.${input.shopId}`)
    .is("deleted_at", null);
  const shopTmpl = (tmplRows ?? []).find(
    (r: Record<string, unknown>) => r.shop_id === input.shopId
  );
  const brandTmpl = (tmplRows ?? []).find(
    (r: Record<string, unknown>) => r.shop_id == null
  );
  const tmpl = shopTmpl ?? brandTmpl;
  if (!tmpl) {
    return {
      sent: 0,
      skippedCooldown: 0,
      skippedNoContact: 0,
      failed: 0,
      couponsIssued: 0,
      error:
        "テンプレートが未登録です。先に「保存」してから配信してください。",
    };
  }
  const message = tmpl.message as string;
  const couponMenuManageId =
    (tmpl.coupon_menu_manage_id as string | null) ?? null;
  const cooldownDays = (tmpl.cooldown_days as number) ?? 30;

  // 店舗の屋号 / 返信先メール (再来店促進は email 固定)
  const { data: shopRow } = await supabase
    .from("shops")
    .select("id, name, email1")
    .eq("id", input.shopId)
    .maybeSingle();
  const shopName = (shopRow?.name as string | null) ?? "";
  const shopEmail = (shopRow?.email1 as string | null) ?? null;

  // クーポンメニュー情報
  type CouponMenu = {
    menu_manage_id: string;
    name: string;
    price: number;
    plan_type: string;
    ticket_count: number | null;
  };
  let couponMenu: CouponMenu | null = null;
  if (couponMenuManageId) {
    const { data: menuRow } = await supabase
      .from("menus")
      .select("menu_manage_id, name, price, plan_type, ticket_count")
      .eq("menu_manage_id", couponMenuManageId)
      .is("deleted_at", null)
      .maybeSingle();
    const m = menuRow as CouponMenu | null;
    if (m && m.plan_type === "ticket") {
      couponMenu = m;
    }
  }

  // 対象顧客のデータ取得
  const { data: custRows } = await supabase
    .from("customers")
    .select("id, last_name, first_name, line_user_id, email")
    .in("id", input.customerIds)
    .eq("shop_id", input.shopId)
    .is("deleted_at", null);
  const customers = (custRows ?? []) as Array<{
    id: number;
    last_name: string | null;
    first_name: string | null;
    line_user_id: string | null;
    email: string | null;
  }>;

  // 直近ログ (cooldown チェック)
  const cooldownSince = daysAgoIso(cooldownDays);
  const { data: recentLogs } = await supabase
    .from("reengagement_logs")
    .select("customer_id, sent_at")
    .in("customer_id", input.customerIds)
    .eq("segment", input.segment)
    .gte("sent_at", cooldownSince);
  const recentSet = new Set(
    (recentLogs ?? []).map(
      (r: { customer_id: number }) => r.customer_id
    )
  );

  const result: SendCampaignResult = {
    sent: 0,
    skippedCooldown: 0,
    skippedNoContact: 0,
    failed: 0,
    couponsIssued: 0,
  };

  for (const c of customers) {
    const customerName =
      [c.last_name, c.first_name].filter(Boolean).join(" ") || "";

    // 1. Cooldown
    if (recentSet.has(c.id)) {
      await insertLog(supabase, {
        brandId: input.brandId,
        shopId: input.shopId,
        customerId: c.id,
        segment: input.segment,
        channel: "skipped",
        status: "skipped_cooldown",
        message: null,
        couponPlanId: null,
        errorMessage: null,
      });
      result.skippedCooldown++;
      continue;
    }

    // 2. 連絡手段チェック (email のみ。LINE は予約リマインド専用)
    const hasEmail = !!c.email;
    if (!hasEmail) {
      await insertLog(supabase, {
        brandId: input.brandId,
        shopId: input.shopId,
        customerId: c.id,
        segment: input.segment,
        channel: "skipped",
        status: "skipped_no_contact",
        message: null,
        couponPlanId: null,
        errorMessage: null,
      });
      result.skippedNoContact++;
      continue;
    }

    // 3. クーポン発行
    let couponPlanId: number | null = null;
    let couponLine = "";
    if (couponMenu) {
      const { data: inserted, error: insErr } = await supabase
        .from("customer_plans")
        .insert({
          brand_id: input.brandId,
          shop_id: input.shopId,
          customer_id: c.id,
          menu_manage_id: couponMenu.menu_manage_id,
          menu_name_snapshot: couponMenu.name,
          price_snapshot: couponMenu.price,
          plan_type: "ticket",
          total_count: couponMenu.ticket_count ?? 1,
          used_count: 0,
          purchased_appointment_id: null,
          status: 0,
          memo: `再来店促進クーポン (${input.segment})`,
        })
        .select("id")
        .single();
      if (!insErr && inserted) {
        couponPlanId = inserted.id as number;
        result.couponsIssued++;
        couponLine = `▼ 特別クーポンをプレゼントいたしました\n「${couponMenu.name}」(¥${couponMenu.price.toLocaleString()} 相当) を次回ご来院時にご利用いただけます。`;
      }
    }

    // 4. テンプレ置換
    const rendered = message
      .replaceAll("{customer_name}", customerName || "お客")
      .replaceAll("{shop_name}", shopName)
      .replaceAll("{coupon_name}", couponLine);

    // 5. 送信 (email 固定。LINE 自動送信は予約リマインドのみに限定する方針)
    const channel = "email" as const;
    let sendOk = false;
    let errMsg: string | null = null;

    if (hasEmail) {
      const r = await sendEmail({
        to: c.email!,
        subject: `${shopName}よりご案内`,
        body: rendered,
        fromName: shopName,
        replyTo: shopEmail,
      });
      sendOk = r.success;
      errMsg = r.error ?? null;
    }

    await insertLog(supabase, {
      brandId: input.brandId,
      shopId: input.shopId,
      customerId: c.id,
      segment: input.segment,
      channel,
      status: sendOk ? "sent" : "failed",
      message: rendered,
      couponPlanId,
      errorMessage: errMsg,
    });

    if (sendOk) result.sent++;
    else result.failed++;
  }

  revalidatePath("/reengagement");
  revalidatePath("/customer");
  return result;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

async function insertLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    brandId: number;
    shopId: number;
    customerId: number;
    segment: ReengagementSegment;
    channel: string;
    status: string;
    message: string | null;
    couponPlanId: number | null;
    errorMessage: string | null;
  }
): Promise<void> {
  await supabase.from("reengagement_logs").insert({
    brand_id: row.brandId,
    shop_id: row.shopId,
    customer_id: row.customerId,
    segment: row.segment,
    channel: row.channel,
    status: row.status,
    message: row.message,
    coupon_plan_id: row.couponPlanId,
    error_message: row.errorMessage,
  });
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
