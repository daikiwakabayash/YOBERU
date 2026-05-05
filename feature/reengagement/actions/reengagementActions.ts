"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";
import { sendEmail } from "@/helper/lib/email/sendEmail";
import type { ReengagementSegment } from "../types";

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
 *      c. LINE userId があれば LINE 送信。無ければメールにフォールバック。
 *         どちらも無ければ skipped_no_contact。
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

  // 店舗の LINE channel token と屋号
  const { data: shopRow } = await supabase
    .from("shops")
    .select("id, name, email1, line_channel_access_token")
    .eq("id", input.shopId)
    .maybeSingle();
  const shopName = (shopRow?.name as string | null) ?? "";
  const lineToken =
    (shopRow?.line_channel_access_token as string | null) ?? null;
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

    // 2. 連絡手段チェック
    const hasLine = !!(c.line_user_id && lineToken);
    const hasEmail = !!c.email;
    if (!hasLine && !hasEmail) {
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

    // 3. claim-based lock
    //    送信前に reengagement_logs を status='sent' で INSERT する。
    //    migration 00043 の partial UNIQUE (customer_id, segment, sent_date)
    //    WHERE status='sent' に守られているため、手動配信と cron の race
    //    で 2 通飛ぶのを構造的に防ぐ。INSERT 失敗 = 既に同日送信済 → skip。
    //    送信失敗時は status を 'failed' に update して再送可能にする
    //    (failed は UNIQUE 対象外)。
    const claimRow = {
      brand_id: input.brandId,
      shop_id: input.shopId,
      customer_id: c.id,
      segment: input.segment,
      channel: hasLine ? "line" : "email",
      status: "sent",
      message: null as string | null,
      coupon_plan_id: null as number | null,
      error_message: null as string | null,
    };
    const { data: claimed, error: claimErr } = await supabase
      .from("reengagement_logs")
      .insert(claimRow)
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) {
      // UNIQUE 違反 (同日既に sent あり) = 別キャンペーン / cron が既に
      // 送信済 → cooldown 扱い。
      result.skippedCooldown++;
      continue;
    }
    const logId = claimed.id as number;

    // 4. クーポン発行 (送信権を握れた呼び出しだけが発行する)
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

    // 5. テンプレ置換
    const rendered = message
      .replaceAll("{customer_name}", customerName || "お客")
      .replaceAll("{shop_name}", shopName)
      .replaceAll("{coupon_name}", couponLine);

    // 6. 送信
    let channel: "line" | "email" = hasLine ? "line" : "email";
    let sendOk = false;
    let errMsg: string | null = null;

    if (hasLine) {
      const r = await sendLineMessage({
        to: c.line_user_id!,
        text: rendered,
        channelAccessToken: lineToken!,
      });
      sendOk = r.success;
      errMsg = r.error ?? null;
    }
    if (!sendOk && hasEmail) {
      channel = "email";
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

    // 7. claim を確定状態に update。
    //    sendOk なら status='sent' のまま (既に INSERT 済) で詳細を埋める。
    //    sendOk = false なら status='failed' に変更して再送可能化。
    await supabase
      .from("reengagement_logs")
      .update({
        channel,
        status: sendOk ? "sent" : "failed",
        message: rendered,
        coupon_plan_id: couponPlanId,
        error_message: errMsg,
      })
      .eq("id", logId);

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
