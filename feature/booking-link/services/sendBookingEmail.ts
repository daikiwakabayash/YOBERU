"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { sendEmail } from "@/helper/lib/email/sendEmail";

/**
 * 予約確認 (即時) メールのデフォルト件名・本文。
 * booking_links.immediate_email_subject / immediate_email_template が
 * NULL のときはこれが使われる。
 */
export const DEFAULT_IMMEDIATE_SUBJECT =
  "【{shop_name}】ご予約ありがとうございます";

export const DEFAULT_IMMEDIATE_TEMPLATE = `{customer_name} 様

この度は {shop_name} をご予約いただき、誠にありがとうございます。
以下の内容でご予約を承りました。

──────────────
日時: {date} {time}
メニュー: {menu}
担当: {staff}
──────────────

当日お会いできるのを楽しみにしております。
ご不明な点がございましたら、このメールへのご返信にてお気軽にお問い合わせください。

{shop_name}`;

interface TemplateContext {
  customer_name: string;
  shop_name: string;
  staff_name: string;
  menu_name: string;
  date: string;
  time: string;
}

function renderTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{customer_name\}/g, ctx.customer_name)
    .replace(/\{shop_name\}/g, ctx.shop_name)
    .replace(/\{staff\}/g, ctx.staff_name)
    .replace(/\{menu\}/g, ctx.menu_name)
    .replace(/\{date\}/g, ctx.date)
    .replace(/\{time\}/g, ctx.time);
}

/**
 * reminder_logs に `offset_days = -1` で記録することで、cron 側の
 * スケジュールメール (offset_days >= 0) と共存しつつ「即時メール送信
 * 済みかどうか」を UNIQUE (appointment_id, type, offset_days) 制約で
 * 一意に判定できる。
 */
const IMMEDIATE_OFFSET = -1;

/**
 * 予約完了直後にお客様へ確認メールを送る。失敗しても例外を投げず、
 * reminder_logs に failed で記録するだけ (= 予約作成そのものは成功
 * させる)。
 *
 * @param appointmentId 予約 ID
 * @param bookingLinkId 予約が入ってきた強制リンクの ID (管理側で
 *                     作成した場合は null)
 */
export async function sendBookingConfirmationEmail(
  appointmentId: number,
  bookingLinkId: number | null
): Promise<void> {
  try {
    const supabase = await createClient();

    // 1. appointment を取得 (start_at, customer, menu, staff, shop を引く
    //    ためのキー)
    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select(
        "id, customer_id, staff_id, menu_manage_id, start_at, shop_id"
      )
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr || !appt) {
      console.warn("[sendBookingConfirmationEmail] 予約取得失敗", {
        appointmentId,
        err: apptErr?.message,
      });
      return;
    }

    // 2. booking_link の即時メール設定 (enable / override 件名 / 本文)
    let immediateEnabled = true;
    let subjectTpl: string | null = null;
    let templateTpl: string | null = null;
    if (bookingLinkId) {
      const { data: link } = await supabase
        .from("booking_links")
        .select(
          "immediate_email_enabled, immediate_email_subject, immediate_email_template"
        )
        .eq("id", bookingLinkId)
        .maybeSingle();
      if (link) {
        // カラムが存在しない (migration 未適用) ときは undefined になるので
        // デフォルト挙動 (送る) にフォールバック。
        if (typeof link.immediate_email_enabled === "boolean") {
          immediateEnabled = link.immediate_email_enabled;
        }
        subjectTpl =
          typeof link.immediate_email_subject === "string"
            ? link.immediate_email_subject
            : null;
        templateTpl =
          typeof link.immediate_email_template === "string"
            ? link.immediate_email_template
            : null;
      }
    }
    if (!immediateEnabled) return;

    // 3. 即時メールは 1 予約につき 1 通だけ。再実行されても重複送信を
    //    防ぐため reminder_logs を先に確認する。
    const { data: existingLog } = await supabase
      .from("reminder_logs")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("type", "email")
      .eq("offset_days", IMMEDIATE_OFFSET)
      .maybeSingle();
    if (existingLog) return;

    // 4. コンテキスト情報を並列取得
    const [customerRes, staffRes, menuRes, shopRes] = await Promise.all([
      supabase
        .from("customers")
        .select("last_name, first_name, email")
        .eq("id", appt.customer_id)
        .maybeSingle(),
      appt.staff_id
        ? supabase
            .from("staffs")
            .select("name")
            .eq("id", appt.staff_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("menus")
        .select("name")
        .eq("menu_manage_id", appt.menu_manage_id)
        .maybeSingle(),
      supabase
        .from("shops")
        .select("name, email1")
        .eq("id", appt.shop_id)
        .maybeSingle(),
    ]);

    const customerEmail = customerRes.data?.email ?? null;
    if (!customerEmail) {
      // メールアドレスがない場合は送信不要。管理側からの電話予約等。
      return;
    }

    const startAt = String(appt.start_at ?? "");
    const ctx: TemplateContext = {
      customer_name:
        `${customerRes.data?.last_name ?? ""} ${customerRes.data?.first_name ?? ""}`.trim() ||
        "お客様",
      shop_name: shopRes.data?.name ?? "店舗",
      staff_name: staffRes.data?.name ?? "担当",
      menu_name: menuRes.data?.name ?? "メニュー",
      date: startAt.slice(0, 10),
      time: startAt.slice(11, 16),
    };

    const subject = renderTemplate(
      subjectTpl && subjectTpl.trim().length > 0
        ? subjectTpl
        : DEFAULT_IMMEDIATE_SUBJECT,
      ctx
    );
    const body = renderTemplate(
      templateTpl && templateTpl.trim().length > 0
        ? templateTpl
        : DEFAULT_IMMEDIATE_TEMPLATE,
      ctx
    );

    // 5. 送信。Reply-To に shops.email1 を入れることで、お客様が返信
    //    するとそのまま店舗に届く (スパム判定緩和にも寄与)。
    const result = await sendEmail({
      to: customerEmail,
      subject,
      body,
      fromName: ctx.shop_name,
      replyTo: shopRes.data?.email1 ?? null,
    });

    // 6. reminder_logs に記録 (成功も失敗も)
    await supabase.from("reminder_logs").insert({
      appointment_id: appointmentId,
      booking_link_id: bookingLinkId,
      type: "email",
      offset_days: IMMEDIATE_OFFSET,
      status: result.success ? "sent" : "failed",
      error_message: result.error ?? null,
    });
  } catch (e) {
    console.error("[sendBookingConfirmationEmail] 想定外エラー", e);
  }
}
