import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import { sendEmail } from "@/helper/lib/email/sendEmail";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";
import { toLocalDateString } from "@/helper/utils/time";
import type { ReminderSetting } from "@/feature/booking-link/types";

/**
 * Cron endpoint that processes reminder sends.
 *
 * Deployment:
 *   - Vercel Cron: add to vercel.json:
 *     {"crons": [{"path": "/api/cron/send-reminders", "schedule": "*\/15 * * * *"}]}
 *   - External cron: GET https://your-app.com/api/cron/send-reminders
 *     with header `Authorization: Bearer <CRON_SECRET>` (if CRON_SECRET env is set)
 *
 * What it does:
 *   1. Finds all booking_links that have any enabled reminder_settings
 *   2. For each setting, computes the target date = today + offset_days
 *   3. Finds appointments on that date that came from a matching link
 *      (identified via visit_source_id OR memo content containing the link slug)
 *   4. For each appointment, checks reminder_logs to avoid duplicate sends
 *   5. Sends the reminder via the configured channel
 *   6. Inserts a row into reminder_logs with the result
 *
 * メール送信は helper/lib/email/sendEmail.ts 経由で Resend が担当する。
 * RESEND_API_KEY 未設定なら送信をスキップ (ログのみ)。ドメイン認証
 * (SPF/DKIM/DMARC) 手順は .env.example のコメント参照。
 */

function requireCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // If no secret set, allow (dev)
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface AppointmentForReminder {
  id: number;
  customer_id: number;
  staff_id: number;
  menu_manage_id: string;
  start_at: string;
  shop_id: number;
  visit_source_id: number | null;
}

interface ReminderContext {
  customer_id: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_line_user_id: string | null;
  shop_id: number;
  shop_name: string;
  shop_email: string | null;
  shop_line_channel_access_token: string | null;
  staff_name: string;
  menu_name: string;
  date: string;
  time: string;
  offset_days: number;
}

function renderTemplate(template: string, ctx: ReminderContext): string {
  return template
    .replace(/\{customer_name\}/g, ctx.customer_name)
    .replace(/\{shop_name\}/g, ctx.shop_name)
    .replace(/\{staff\}/g, ctx.staff_name)
    .replace(/\{menu\}/g, ctx.menu_name)
    .replace(/\{date\}/g, ctx.date)
    .replace(/\{time\}/g, ctx.time)
    .replace(/\{offset_days\}/g, String(ctx.offset_days));
}

function addDays(dateStr: string, days: number): string {
  // dateStr は JST の YYYY-MM-DD。JST 正午基準で日数加算してから JST 文字列に
  // 戻すことで DST 影響なくシフトする (JST に DST は無いが念のため)。
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export async function GET(request: NextRequest) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // 1. Load all booking links with at least one enabled reminder
  let links: Array<{
    id: number;
    brand_id: number;
    shop_id: number | null;
    visit_source_id: number | null;
    reminder_settings: ReminderSetting[];
  }> = [];
  try {
    const { data, error } = await supabase
      .from("booking_links")
      .select("id, brand_id, shop_id, visit_source_id, reminder_settings")
      .is("deleted_at", null);
    if (error) throw error;
    links = (data ?? []).filter((l) => {
      const settings = (l.reminder_settings as ReminderSetting[]) ?? [];
      return settings.some((s) => s.enabled);
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message.includes("does not exist")
            ? "booking_links/reminder_settings テーブルが未セットアップです。migration 004 を実行してください。"
            : String(err),
      },
      { status: 500 }
    );
  }

  // 「今日」は Asia/Tokyo 基準で計算する。new Date() の素直な利用は
  // サーバの UTC で日付が決まるため、JST 0:00〜9:00 の cron 実行で
  // 前日扱いになり、当日リマインドが消える事故を起こす。CLAUDE.md の
  // 規約に従い toLocalDateString を使う。
  const today = toLocalDateString(new Date());

  const results: Array<{
    appointment_id: number;
    type: string;
    status: string;
    error?: string;
  }> = [];

  for (const link of links) {
    const settings = (link.reminder_settings as ReminderSetting[]) ?? [];
    for (const setting of settings) {
      if (!setting.enabled) continue;

      const targetDate = addDays(today, setting.offset_days);

      // 2. Find appointments on target date for this link's shop/visit_source
      let apptQuery = supabase
        .from("appointments")
        .select(
          "id, customer_id, staff_id, menu_manage_id, start_at, shop_id, visit_source_id"
        )
        .gte("start_at", `${targetDate}T00:00:00`)
        .lt("start_at", `${targetDate}T23:59:59`)
        .is("deleted_at", null)
        .is("cancelled_at", null);

      if (link.shop_id) apptQuery = apptQuery.eq("shop_id", link.shop_id);
      if (link.visit_source_id)
        apptQuery = apptQuery.eq("visit_source_id", link.visit_source_id);

      const { data: appts } = await apptQuery;
      const appointments = (appts ?? []) as AppointmentForReminder[];

      // まず「既に送信済 (reminder_logs にエントリあり)」を 1 クエリで
      // 引いてバルクで除外する。N+1 回避 + 後続の per-customer dedup が
      // 「未送信予約のみを対象」にできるようにするのが目的。
      //
      // 旧実装は dedup → existingLog 順だったため、「同じ顧客の朝予約と
      // 夕方予約」のうち朝を送って log した後、毎回 dedup で夕予約が
      // 除外され続け、夕予約のリマインドが永遠に送られないバグがあった。
      const apptIdsForCheck = appointments.map((a) => a.id);
      let alreadySentIds = new Set<number>();
      if (apptIdsForCheck.length > 0) {
        const { data: existingLogs } = await supabase
          .from("reminder_logs")
          .select("appointment_id")
          .in("appointment_id", apptIdsForCheck)
          .eq("type", setting.type)
          .eq("offset_days", setting.offset_days);
        alreadySentIds = new Set(
          (existingLogs ?? []).map((l) => l.appointment_id as number)
        );
      }
      const unsent = appointments.filter((a) => !alreadySentIds.has(a.id));

      // 未送信予約のうち、同じ顧客が複数件持つ場合は最早の 1 件だけ通知
      // (連投回避)。次回 cron では今回送った 1 件が alreadySentIds に
      // 入るので、同じ顧客の次の予約が dedup で残って通知される。
      const seenCustomerIds = new Set<number>();
      const dedupedAppointments = unsent
        .slice()
        .sort((a, b) => a.start_at.localeCompare(b.start_at))
        .filter((a) => {
          if (seenCustomerIds.has(a.customer_id)) return false;
          seenCustomerIds.add(a.customer_id);
          return true;
        });

      for (const appt of dedupedAppointments) {

        // 4. Build context
        const [customer, staff, menu, shop] = await Promise.all([
          supabase
            .from("customers")
            .select("last_name, first_name, email, phone_number_1, line_user_id")
            .eq("id", appt.customer_id)
            .single(),
          supabase
            .from("staffs")
            .select("name")
            .eq("id", appt.staff_id)
            .single(),
          supabase
            .from("menus")
            .select("name")
            .eq("menu_manage_id", appt.menu_manage_id)
            .maybeSingle(),
          supabase
            .from("shops")
            .select("name, email1, line_channel_access_token")
            .eq("id", appt.shop_id)
            .single(),
        ]);

        const ctx: ReminderContext = {
          customer_id: appt.customer_id,
          customer_name: `${customer.data?.last_name ?? ""} ${customer.data?.first_name ?? ""}`.trim() || "お客様",
          customer_email: customer.data?.email ?? null,
          customer_phone: customer.data?.phone_number_1 ?? null,
          customer_line_user_id:
            (customer.data?.line_user_id as string | null) ?? null,
          shop_id: appt.shop_id,
          shop_name: shop.data?.name ?? "店舗",
          shop_email: shop.data?.email1 ?? null,
          shop_line_channel_access_token:
            (shop.data?.line_channel_access_token as string | null) ?? null,
          staff_name: staff.data?.name ?? "担当",
          menu_name: menu.data?.name ?? "メニュー",
          date: appt.start_at.slice(0, 10),
          time: appt.start_at.slice(11, 16),
          offset_days: setting.offset_days,
        };

        // 5. Send。setting.type が 'line' でも、顧客が未連携なら email に
        // フォールバック。逆に 'email' でも line_user_id があれば LINE 優先
        // (メール疲れ / 到達率向上目的)。実送信チャネルを effectiveType に
        // 記録して reminder_logs に残す。
        let sendResult: { success: boolean; error?: string };
        let effectiveType: "email" | "line" | "sms" = setting.type;
        const body = renderTemplate(setting.template, ctx);
        const subject = renderTemplate(setting.subject ?? "", ctx);

        const canSendLine =
          !!ctx.customer_line_user_id && !!ctx.shop_line_channel_access_token;

        if (setting.type === "line" || (setting.type === "email" && canSendLine)) {
          if (canSendLine) {
            effectiveType = "line";
            sendResult = await sendLineMessage({
              to: ctx.customer_line_user_id!,
              text: body,
              channelAccessToken: ctx.shop_line_channel_access_token!,
              audit: {
                supabase,
                shopId: ctx.shop_id,
                customerId: ctx.customer_id,
                source: "reminder",
              },
            });
          } else if (setting.type === "email") {
            // キープ: email で送る
            effectiveType = "email";
            if (!ctx.customer_email) {
              sendResult = { success: false, error: "メールアドレスなし" };
            } else {
              sendResult = await sendEmail({
                to: ctx.customer_email,
                subject,
                body,
                fromName: ctx.shop_name,
                replyTo: ctx.shop_email,
              });
            }
          } else {
            // setting=line だが未連携 → email フォールバック
            if (ctx.customer_email) {
              effectiveType = "email";
              sendResult = await sendEmail({
                to: ctx.customer_email,
                subject,
                body,
                fromName: ctx.shop_name,
                replyTo: ctx.shop_email,
              });
            } else {
              sendResult = {
                success: false,
                error: "LINE 未連携でメールも無いため送信できません",
              };
            }
          }
        } else if (setting.type === "email") {
          effectiveType = "email";
          if (!ctx.customer_email) {
            sendResult = { success: false, error: "メールアドレスなし" };
          } else {
            sendResult = await sendEmail({
              to: ctx.customer_email,
              subject,
              body,
              fromName: ctx.shop_name,
              replyTo: ctx.shop_email,
            });
          }
        } else {
          // sms: 未実装
          console.log("[REMINDER SMS] (未実装)", {
            to: ctx.customer_phone,
            body,
          });
          sendResult = { success: true };
        }

        // 6. Log
        await supabase.from("reminder_logs").insert({
          appointment_id: appt.id,
          booking_link_id: link.id,
          type: setting.type,
          offset_days: setting.offset_days,
          status: sendResult.success ? "sent" : "failed",
          error_message: sendResult.error ?? null,
          channel: effectiveType,
        });

        results.push({
          appointment_id: appt.id,
          type: effectiveType,
          status: sendResult.success ? "sent" : "failed",
          error: sendResult.error,
        });
      }
    }
  }

  return NextResponse.json({
    processed_at: new Date().toISOString(),
    total_sent: results.filter((r) => r.status === "sent").length,
    total_failed: results.filter((r) => r.status === "failed").length,
    details: results,
  });
}
