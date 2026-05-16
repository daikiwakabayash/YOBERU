import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/helper/lib/supabase/admin";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";
import { toLocalDateString } from "@/helper/utils/time";
import type { ReminderSetting } from "@/feature/booking-link/types";

/**
 * Cron endpoint that processes reminder sends.
 *
 * 仕様 (migration 00048 以降):
 *   - **LINE only**。reminder_settings の type="line" エントリだけを処理し、
 *     type="email" / "sms" は無視する (誤送信防止のため LINE/Email の
 *     チャネル混在を完全に廃止)。
 *   - **強制リンクのみ**。booking_links.is_mandatory_line=true の link 配下の
 *     予約のみが対象。
 *   - **初回予約のみ**。appointments.visit_count=1 の予約のみが対象。
 *   - **LINE 紐付け済みのみ**。customers.line_user_id IS NOT NULL の顧客
 *     のみが対象。未紐付けは silent skip。
 *   - **多重送信防止**。reminder_logs を INSERT FIRST 方式 (upsert +
 *     ignoreDuplicates) で確保してから送信。SELECT → 送信 → INSERT の
 *     race condition を原理的に防ぐ。
 *   - **緊急停止**。LINE_SEND_DISABLED=true が env にあれば全停止
 *     (sendLineMessage 側でも防御するが、cron は早期 return)。
 *
 * Deployment:
 *   - Vercel Cron: vercel.json で {"path": "/api/cron/send-reminders",
 *     "schedule": "*\/15 * * * *"}
 *   - External cron: GET https://<host>/api/cron/send-reminders
 *     with header `Authorization: Bearer <CRON_SECRET>` (CRON_SECRET 必須)
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
  visit_count: number | null;
}

interface ReminderContext {
  customer_id: number;
  customer_name: string;
  customer_line_user_id: string;
  shop_id: number;
  shop_name: string;
  shop_line_channel_access_token: string;
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
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ResultStatus =
  | "sent"
  | "failed"
  | "skipped_existing"
  | "skipped_locked"
  | "skipped_not_linked"
  | "skipped_no_token";

export async function GET(request: NextRequest) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 緊急停止スイッチ。Vercel env に LINE_SEND_DISABLED=true を入れて
  // 再デプロイすると即時停止。sendLineMessage 側にも同等チェックがあるが
  // ここで早期 return することで DB アクセスすら発生させない。
  if (process.env.LINE_SEND_DISABLED === "true") {
    return NextResponse.json({
      processed_at: new Date().toISOString(),
      skipped: "LINE_SEND_DISABLED",
    });
  }

  // cron は信頼されたサーバ処理。anon クライアントだと RLS で
  // reminder_logs への書き込みが 401 になるため service-role を使う。
  const supabase = createAdminClient();

  // 1. 強制リンク (is_mandatory_line=true) で enabled な LINE reminder_settings
  //    を含む booking_links を取得。
  let links: Array<{
    id: number;
    brand_id: number;
    shop_id: number | null;
    visit_source_id: number | null;
    reminder_settings: ReminderSetting[];
    is_mandatory_line: boolean;
  }> = [];
  try {
    const { data, error } = await supabase
      .from("booking_links")
      .select(
        "id, brand_id, shop_id, visit_source_id, reminder_settings, is_mandatory_line"
      )
      .is("deleted_at", null)
      .eq("is_mandatory_line", true);
    if (error) throw error;
    links = (data ?? []).filter((l) => {
      const settings = (l.reminder_settings as ReminderSetting[]) ?? [];
      // type="line" の enabled なエントリが 1 つでもあればこの link は対象
      return settings.some((s) => s.enabled && s.type === "line");
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message.includes("does not exist")
            ? "booking_links のセットアップが未完了です。migration 00048 を適用してください。"
            : String(err),
      },
      { status: 500 }
    );
  }

  // "今日" は Asia/Tokyo の日付。Vercel cron は UTC で動くため、
  // 単純な `new Date()` だと深夜帯に日付がずれて offset_days=0 の
  // 当日リマインドが取りこぼされる。
  const today = toLocalDateString(new Date());

  // 現在時刻 (Asia/Tokyo "HH:MM") を取得して setting.send_time との
  // 比較に使う。送信時刻に達していない reminder_setting はこの回は
  // 飛ばし、次の cron 周回 (15 分後) で再評価する。
  const nowHHMM = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const results: Array<{
    appointment_id: number;
    status: ResultStatus;
    error?: string;
  }> = [];

  for (const link of links) {
    const settings = (link.reminder_settings as ReminderSetting[]) ?? [];
    for (const setting of settings) {
      if (!setting.enabled) continue;
      // LINE only。email / sms は完全に無視する (誤送信防止の根本対策)
      if (setting.type !== "line") continue;

      // 送信予定時刻ゲート。setting.send_time ("HH:MM") が現在時刻より
      // 未来ならこの cron 周回はスキップ。値が空 or 不正なら従来通り
      // 即座に送信する。
      if (
        setting.send_time &&
        /^\d{2}:\d{2}$/.test(setting.send_time) &&
        nowHHMM < setting.send_time
      ) {
        continue;
      }

      const targetDate = addDays(today, setting.offset_days);
      const nextDate = addDays(targetDate, 1);

      // 2. 対象日の予約を取得。
      //    - visit_count=1 (初回)
      //    - link の shop / visit_source 制約
      //    - キャンセル / 論理削除でない
      let apptQuery = supabase
        .from("appointments")
        .select(
          "id, customer_id, staff_id, menu_manage_id, start_at, shop_id, visit_source_id, visit_count"
        )
        .gte("start_at", `${targetDate}T00:00:00`)
        .lt("start_at", `${nextDate}T00:00:00`)
        .is("deleted_at", null)
        .is("cancelled_at", null)
        .eq("visit_count", 1);

      if (link.shop_id) apptQuery = apptQuery.eq("shop_id", link.shop_id);
      if (link.visit_source_id)
        apptQuery = apptQuery.eq("visit_source_id", link.visit_source_id);

      const { data: appts } = await apptQuery;
      const appointments = (appts ?? []) as AppointmentForReminder[];

      // 同じ顧客が複数予約を持っていても 1 回しか通知しない安全装置。
      // visit_count=1 のため通常 1 件しかヒットしないが、データ不整合時の
      // 保険として保持。早い時間の予約を残す。
      const seenCustomerIds = new Set<number>();
      const dedupedAppointments = appointments
        .slice()
        .sort((a, b) => a.start_at.localeCompare(b.start_at))
        .filter((a) => {
          if (seenCustomerIds.has(a.customer_id)) return false;
          seenCustomerIds.add(a.customer_id);
          return true;
        });

      for (const appt of dedupedAppointments) {
        // 3a. (高速 path) 既送信なら何もしない。本確認は早期 skip 用の最適化。
        //     真の重複防止は下の upsert で行う。
        const { data: existingLog } = await supabase
          .from("reminder_logs")
          .select("id")
          .eq("appointment_id", appt.id)
          .eq("type", "line")
          .eq("offset_days", setting.offset_days)
          .maybeSingle();
        if (existingLog) {
          results.push({ appointment_id: appt.id, status: "skipped_existing" });
          continue;
        }

        // 3b. 顧客 / 店舗の必要情報を取得。LINE 紐付け / トークン未設定なら
        //     reminder_logs を書かずに skip (= 紐付くまで送信を保留)。
        const [customerRes, staffRes, menuRes, shopRes] = await Promise.all([
          supabase
            .from("customers")
            .select("last_name, first_name, line_user_id")
            .eq("id", appt.customer_id)
            .maybeSingle(),
          supabase
            .from("staffs")
            .select("name")
            .eq("id", appt.staff_id)
            .maybeSingle(),
          supabase
            .from("menus")
            .select("name")
            .eq("menu_manage_id", appt.menu_manage_id)
            .maybeSingle(),
          supabase
            .from("shops")
            .select("name, line_channel_access_token")
            .eq("id", appt.shop_id)
            .maybeSingle(),
        ]);

        const lineUserId =
          (customerRes.data?.line_user_id as string | null) ?? null;
        const channelAccessToken =
          (shopRes.data?.line_channel_access_token as string | null) ?? null;

        if (!lineUserId) {
          // LINE 未紐付け。reminder_logs にはまだ書かない (= 後で紐付いて
          // 当日中に cron が再走したら送れるようにする)。ただし
          // visit_count=1 + 当日対象なので、紐付かないまま日付を跨げば
          // 自然に対象外になる。
          results.push({
            appointment_id: appt.id,
            status: "skipped_not_linked",
          });
          continue;
        }
        if (!channelAccessToken) {
          // 店舗のトークン未設定。これも reminder_logs には書かず skip。
          results.push({
            appointment_id: appt.id,
            status: "skipped_no_token",
          });
          continue;
        }

        // 4. INSERT FIRST。lock row を upsert で確保してから送信する。
        //    UNIQUE(appointment_id, type, offset_days) で他プロセス / 過去の
        //    成功行と衝突した場合は ignoreDuplicates により行が返らず、
        //    送信処理に進まない (= 多重送信を原理的に防ぐ)。
        const { data: locked, error: lockErr } = await supabase
          .from("reminder_logs")
          .upsert(
            {
              appointment_id: appt.id,
              booking_link_id: link.id,
              type: "line",
              offset_days: setting.offset_days,
              status: "sending",
              channel: "line",
            },
            {
              onConflict: "appointment_id,type,offset_days",
              ignoreDuplicates: true,
            }
          )
          .select("id")
          .maybeSingle();

        if (lockErr) {
          console.error("[send-reminders] lock upsert failed", {
            apptId: appt.id,
            lockErr,
          });
          results.push({
            appointment_id: appt.id,
            status: "failed",
            error: `lock failed: ${lockErr.message}`,
          });
          continue;
        }
        if (!locked) {
          // 並走する他プロセスが先に lock を取得した。重複送信を防止。
          results.push({
            appointment_id: appt.id,
            status: "skipped_locked",
          });
          continue;
        }

        // 5. 本文をレンダリング & LINE 送信
        const customerName =
          `${customerRes.data?.last_name ?? ""} ${customerRes.data?.first_name ?? ""}`.trim() ||
          "お客様";
        const ctx: ReminderContext = {
          customer_id: appt.customer_id,
          customer_name: customerName,
          customer_line_user_id: lineUserId,
          shop_id: appt.shop_id,
          shop_name: (shopRes.data?.name as string) ?? "店舗",
          shop_line_channel_access_token: channelAccessToken,
          staff_name: (staffRes.data?.name as string) ?? "担当",
          menu_name: (menuRes.data?.name as string) ?? "メニュー",
          date: appt.start_at.slice(0, 10),
          time: appt.start_at.slice(11, 16),
          offset_days: setting.offset_days,
        };
        const body = renderTemplate(setting.template, ctx);

        const sendResult = await sendLineMessage({
          to: ctx.customer_line_user_id,
          text: body,
          channelAccessToken: ctx.shop_line_channel_access_token,
          audit: {
            supabase,
            shopId: ctx.shop_id,
            customerId: ctx.customer_id,
            source: "reminder",
          },
        });

        // 6. lock row のステータスを送信結果で更新
        const { error: updateErr } = await supabase
          .from("reminder_logs")
          .update({
            status: sendResult.success ? "sent" : "failed",
            error_message: sendResult.error ?? null,
          })
          .eq("id", locked.id as number);
        if (updateErr) {
          console.error("[send-reminders] log status update failed", {
            apptId: appt.id,
            updateErr,
          });
        }

        results.push({
          appointment_id: appt.id,
          status: sendResult.success ? "sent" : "failed",
          error: sendResult.error,
        });
      }
    }
  }

  const count = (s: ResultStatus) =>
    results.filter((r) => r.status === s).length;

  return NextResponse.json({
    processed_at: new Date().toISOString(),
    total_sent: count("sent"),
    total_failed: count("failed"),
    total_skipped_existing: count("skipped_existing"),
    total_skipped_locked: count("skipped_locked"),
    total_skipped_not_linked: count("skipped_not_linked"),
    total_skipped_no_token: count("skipped_no_token"),
    details: results,
  });
}
