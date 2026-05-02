import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import crypto from "crypto";

/**
 * LINE Messaging API Webhook endpoint.
 *
 * Receives follow / unfollow / message events from LINE and:
 *   - follow:   stores the LINE userId in the customer row that was
 *               pending linkage (via the `state` query param the user
 *               clicked through from the booking confirmation page)
 *   - unfollow: clears the line_user_id so we stop sending reminders
 *   - message:  persists the text to line_messages (inbound) so the
 *               dashboard /line-chat view can render a thread
 *
 * Authentication: validates the X-Line-Signature header using the
 * shop's channel_secret (HMAC-SHA256). We look up the secret from the
 * first shop whose line_channel_id matches the destination in the
 * payload. If validation fails, 403.
 *
 * Path: POST /api/line/webhook
 * Full webhook URL to register in the LINE Developers console:
 *   https://<your-vercel-domain>/api/line/webhook
 */

interface LineMessage {
  id?: string;
  type: string;
  text?: string;
  stickerId?: string;
  packageId?: string;
}

interface LineEvent {
  type: string;
  source?: { type: string; userId?: string };
  replyToken?: string;
  timestamp?: number;
  message?: LineMessage;
}

interface LineWebhookBody {
  destination?: string;
  events: LineEvent[];
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  // Look up the channel secret for signature verification.
  // `destination` is the bot's userId — we match it to shops by
  // line_channel_id or fall back to any shop with a configured token.
  let channelSecret: string | null = null;
  let shopId: number | null = null;

  try {
    const { data: shopRow } = body.destination
      ? await supabase
          .from("shops")
          .select("id, line_channel_secret")
          .eq("line_channel_id", body.destination)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null };

    if (shopRow?.line_channel_secret) {
      channelSecret = shopRow.line_channel_secret as string;
      shopId = shopRow.id as number;
    } else {
      // Fallback: first shop with a configured secret
      const { data: anyShop } = await supabase
        .from("shops")
        .select("id, line_channel_secret")
        .not("line_channel_secret", "is", null)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (anyShop?.line_channel_secret) {
        channelSecret = anyShop.line_channel_secret as string;
        shopId = anyShop.id as number;
      }
    }
  } catch {
    // Column doesn't exist yet (migration 00013 not applied).
    // Accept the webhook without validation so Vercel can respond 200
    // and LINE doesn't disable the endpoint.
  }

  // Signature verification (skip if no secret configured — dev mode)
  if (channelSecret) {
    const expected = crypto
      .createHmac("SHA256", channelSecret)
      .update(rawBody)
      .digest("base64");
    if (signature !== expected) {
      console.error("[LINE webhook] Signature mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  async function lookupCustomerId(
    lineUserId: string
  ): Promise<number | null> {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("line_user_id", lineUserId)
      .is("deleted_at", null)
      .maybeSingle();
    return (data?.id as number | undefined) ?? null;
  }

  // Process events
  for (const event of body.events ?? []) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    if (event.type === "follow") {
      // 友だち追加された。
      //
      // 重要: 過去の実装は「最近予約した顧客のうち line_user_id NULL の
      // 1 人に当てずっぽうで貼る」推測ロジックを使っていたが、別人に
      // 紐付いて他人の予約リマインドが届く事故を起こしていた
      // (migration 00042 で全クリア済)。
      //
      // 紐付けは以下のいずれかでのみ確定する:
      //   - 予約完了画面の LIFF ボタン (state=customer token を持つ) →
      //     /line/liff の link モードが署名検証して紐付け
      //   - /line-chat 画面の手動「紐付ける」UI からスタッフが選択
      //
      // ここでは welcome メッセージを返すだけにとどめる。
      // 紐付け済の既存顧客は (customer_id を埋めたまま) スレッドが
      // 続くが、新規 follow 者は customer_id NULL の「未登録ユーザー」
      // として line-chat 画面に並ぶ (= スタッフが紐付けるか、本人が
      // LIFF 経由で紐付けるまで待機)。

      // Welcome reply + persist as outbound in line_messages
      if (shopId) {
        try {
          const { data: shop } = await supabase
            .from("shops")
            .select("name, line_channel_access_token")
            .eq("id", shopId)
            .maybeSingle();
          const token = shop?.line_channel_access_token as string | null;
          const welcomeText = `友だち追加ありがとうございます！\n${
            (shop?.name as string) ?? "当院"
          }の予約リマインドをお届けします。\nご質問がありましたら、このトーク画面からお気軽にメッセージをお送りください。`;

          if (token && event.replyToken) {
            await fetch("https://api.line.me/v2/bot/message/reply", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                replyToken: event.replyToken,
                messages: [{ type: "text", text: welcomeText }],
              }),
            });
          }

          await supabase.from("line_messages").insert({
            shop_id: shopId,
            customer_id: await lookupCustomerId(lineUserId),
            line_user_id: lineUserId,
            direction: "outbound",
            message_type: "text",
            text: welcomeText,
            source: "follow_welcome",
            delivery_status: token ? "success" : "failed",
          });
        } catch (e) {
          console.error("[LINE webhook] welcome failed", e);
        }
      }
    } else if (event.type === "unfollow") {
      // User blocked the bot. Drop the linkage and log a system entry.
      await supabase
        .from("customers")
        .update({ line_user_id: null })
        .eq("line_user_id", lineUserId);
      if (shopId) {
        await supabase.from("line_messages").insert({
          shop_id: shopId,
          line_user_id: lineUserId,
          direction: "inbound",
          message_type: "system",
          text: "(ブロック / 友だち削除)",
          source: "webhook",
        });
      }
      console.log(
        `[LINE webhook] Cleared line_user_id for blocked user ${lineUserId}`
      );
    } else if (event.type === "message") {
      // Persist incoming messages so staff can respond from the dashboard.
      if (!shopId) continue;
      const msg = event.message ?? { type: "unknown" };
      const customerId = await lookupCustomerId(lineUserId);

      let text: string | null = null;
      const type = msg.type ?? "unknown";
      if (type === "text") {
        text = msg.text ?? "";
      } else if (type === "sticker") {
        text = `(スタンプ package=${msg.packageId ?? "?"} sticker=${msg.stickerId ?? "?"})`;
      } else if (type === "image") {
        text = "(画像が送信されました)";
      } else if (type === "location") {
        text = "(位置情報が送信されました)";
      } else {
        text = `(${type} メッセージ)`;
      }

      await supabase.from("line_messages").insert({
        shop_id: shopId,
        customer_id: customerId,
        line_user_id: lineUserId,
        direction: "inbound",
        message_type: type,
        text,
        line_message_id: msg.id ?? null,
        source: "webhook",
      });
    }
  }

  // LINE requires 200 within 1 second
  return NextResponse.json({ ok: true });
}
