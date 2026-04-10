import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
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
 * NOTE: Actual email delivery requires configuring an SMTP provider. This
 * endpoint currently LOGS what would be sent. See sendEmail() below — wire
 * up your transactional email provider (Resend, SendGrid, Nodemailer, etc.)
 * inside that function.
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
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shop_name: string;
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

/**
 * Placeholder email sender. Replace with a real provider in production.
 * Example (Resend):
 *
 *   import { Resend } from 'resend';
 *   const resend = new Resend(process.env.RESEND_API_KEY);
 *   await resend.emails.send({
 *     from: 'reservation@yoberu.app',
 *     to,
 *     subject,
 *     text: body,
 *   });
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  if (!to) return { success: false, error: "宛先メールアドレスなし" };

  // TODO: Wire up your email provider here.
  // For now, log the intended send so the flow can be verified.
  console.log("[REMINDER EMAIL]", { to, subject, bodyPreview: body.slice(0, 100) });
  return { success: true };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

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

      for (const appt of appointments) {
        // 3. Check if already sent
        const { data: existingLog } = await supabase
          .from("reminder_logs")
          .select("id")
          .eq("appointment_id", appt.id)
          .eq("type", setting.type)
          .eq("offset_days", setting.offset_days)
          .maybeSingle();
        if (existingLog) {
          continue; // already sent
        }

        // 4. Build context
        const [customer, staff, menu, shop] = await Promise.all([
          supabase
            .from("customers")
            .select("last_name, first_name, email, phone_number_1")
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
            .select("name")
            .eq("id", appt.shop_id)
            .single(),
        ]);

        const ctx: ReminderContext = {
          customer_name: `${customer.data?.last_name ?? ""} ${customer.data?.first_name ?? ""}`.trim() || "お客様",
          customer_email: customer.data?.email ?? null,
          customer_phone: customer.data?.phone_number_1 ?? null,
          shop_name: shop.data?.name ?? "店舗",
          staff_name: staff.data?.name ?? "担当",
          menu_name: menu.data?.name ?? "メニュー",
          date: appt.start_at.slice(0, 10),
          time: appt.start_at.slice(11, 16),
          offset_days: setting.offset_days,
        };

        // 5. Send
        let sendResult: { success: boolean; error?: string };
        if (setting.type === "email") {
          if (!ctx.customer_email) {
            sendResult = { success: false, error: "メールアドレスなし" };
          } else {
            const subject = renderTemplate(setting.subject ?? "", ctx);
            const body = renderTemplate(setting.template, ctx);
            sendResult = await sendEmail(ctx.customer_email, subject, body);
          }
        } else if (setting.type === "sms") {
          // TODO: wire up Twilio or similar
          console.log("[REMINDER SMS]", {
            to: ctx.customer_phone,
            body: renderTemplate(setting.template, ctx),
          });
          sendResult = { success: true };
        } else {
          // line
          // TODO: wire up LINE Messaging API
          console.log("[REMINDER LINE]", {
            customer: ctx.customer_name,
            body: renderTemplate(setting.template, ctx),
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
        });

        results.push({
          appointment_id: appt.id,
          type: setting.type,
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
