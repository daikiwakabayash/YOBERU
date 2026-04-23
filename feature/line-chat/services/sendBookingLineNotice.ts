import { createClient } from "@/helper/lib/supabase/server";
import { sendLineMessage } from "@/helper/lib/line/sendLineMessage";

/**
 * 予約確定時に、顧客の LINE に予約確認 + 問診票案内を送る。
 *
 * 動作条件:
 *   - customers.line_user_id が埋まっている (公式 LINE を友だち追加済)
 *   - shops.line_channel_access_token が設定済
 *   上記どちらか欠ければ黙って skip (= true を返す)。確認メールは
 *   別ルートで飛ぶので二重にアラートしない。
 *
 * 問診票 URL の選定:
 *   - その shop の brand_id に紐づく active な questionnaires を 1 件取得
 *   - 無ければ問診票パートは省略して予約確認のみ送信
 *   - 公開 URL は `<APP_URL>/q/<slug>`
 */
export async function sendBookingLineNotice(
  appointmentId: number
): Promise<{ sent: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, brand_id, shop_id, customer_id, staff_id, menu_manage_id, start_at, end_at"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { sent: false, error: "予約が見つかりません" };

  const [customerRes, shopRes, staffRes, menuRes, questionnaireRes] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, last_name, first_name, line_user_id")
        .eq("id", appt.customer_id as number)
        .maybeSingle(),
      supabase
        .from("shops")
        .select("id, name, line_channel_access_token")
        .eq("id", appt.shop_id as number)
        .maybeSingle(),
      supabase
        .from("staffs")
        .select("name")
        .eq("id", appt.staff_id as number)
        .maybeSingle(),
      supabase
        .from("menus")
        .select("name")
        .eq("menu_manage_id", appt.menu_manage_id as string)
        .maybeSingle(),
      supabase
        .from("questionnaires")
        .select("slug")
        .eq("brand_id", appt.brand_id as number)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const lineUserId = customerRes.data?.line_user_id as string | null;
  const token = shopRes.data?.line_channel_access_token as string | null;
  if (!lineUserId || !token) return { sent: false };

  const customerName =
    `${customerRes.data?.last_name ?? ""} ${customerRes.data?.first_name ?? ""}`.trim() ||
    "お客様";
  const shopName = (shopRes.data?.name as string) ?? "店舗";
  const staffName = (staffRes.data?.name as string) ?? "担当";
  const menuName = (menuRes.data?.name as string) ?? "メニュー";

  const startAt = appt.start_at as string;
  const date = startAt.slice(0, 10);
  const time = startAt.slice(11, 16);

  const questionnaireSlug = questionnaireRes.data?.slug as string | undefined;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://yoberu.example.com";
  const questionnaireUrl = questionnaireSlug
    ? `${appUrl}/q/${questionnaireSlug}`
    : null;

  const lines = [
    `${customerName} 様`,
    "",
    `${shopName} のご予約を承りました。`,
    "",
    `📅 日時: ${date} ${time}`,
    `👤 担当: ${staffName}`,
    `💆 メニュー: ${menuName}`,
    "",
  ];
  if (questionnaireUrl) {
    lines.push(
      "ご来店をスムーズにするため、下記の問診票へのご回答をお願いいたします。"
    );
    lines.push(questionnaireUrl);
    lines.push("");
  }
  lines.push("ご不明な点はこのトークからお気軽にお問い合わせください。");

  const result = await sendLineMessage({
    to: lineUserId,
    text: lines.join("\n"),
    channelAccessToken: token,
    audit: {
      supabase,
      shopId: appt.shop_id as number,
      customerId: appt.customer_id as number,
      source: questionnaireUrl ? "booking_confirm_with_q" : "booking_confirm",
    },
  });

  return { sent: result.success, error: result.error };
}
