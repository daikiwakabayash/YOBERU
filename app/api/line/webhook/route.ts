import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
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
  //
  // `destination` は LINE 公式アカウントの bot userId。これを
  // shops.line_channel_id と照合してその店舗の secret で検証する。
  //
  // 旧実装は destination が一致しない時に「最初に見つかった任意店舗の
  // secret」で fallback 検証していたが、複数店舗運用で他店舗の secret が
  // 漏えいすると関係ない店舗の webhook も通ってしまうため廃止。
  // destination 不一致 / shops 未設定の場合は明示的に 400 / 403 で拒否。
  //
  // 例外: shops に line_channel_secret がまだ 1 件も設定されていない
  // 環境 (= 初期 setup / dev) では検証 skip して受け入れる。これは
  // 「未設定で webhook が来る」状況自体が dev / migration 直後しか
  // ありえないため。
  let channelSecret: string | null = null;
  let shopId: number | null = null;
  let columnMissing = false;

  if (!body.destination) {
    return NextResponse.json(
      { error: "Missing destination" },
      { status: 400 }
    );
  }

  try {
    const { data: shopRow } = await supabase
      .from("shops")
      .select("id, line_channel_secret")
      .eq("line_channel_id", body.destination)
      .is("deleted_at", null)
      .maybeSingle();

    if (shopRow?.line_channel_secret) {
      channelSecret = shopRow.line_channel_secret as string;
      shopId = shopRow.id as number;
    } else if (shopRow) {
      // shop は見つかったが secret 未設定 → 設定不備として拒否
      console.error(
        `[LINE webhook] shop ${shopRow.id} has no line_channel_secret`
      );
      return NextResponse.json(
        { error: "Shop secret not configured" },
        { status: 403 }
      );
    } else {
      // destination に対応する shop が無い。dev / 初期 setup として
      // shops に secret 持ちが 1 件もないなら受け入れる。1 件でもあるなら
      // 「不正な destination」として 403 拒否。
      const { count } = await supabase
        .from("shops")
        .select("id", { count: "exact", head: true })
        .not("line_channel_secret", "is", null)
        .is("deleted_at", null);
      if ((count ?? 0) > 0) {
        console.error(
          `[LINE webhook] unknown destination ${body.destination}`
        );
        return NextResponse.json(
          { error: "Unknown destination" },
          { status: 403 }
        );
      }
      // 1 件もなければ dev 扱いで signature 検証を skip
    }
  } catch (err) {
    // Column doesn't exist yet (migration 00013 not applied).
    // Accept the webhook without validation so Vercel can respond 200
    // and LINE doesn't disable the endpoint.
    columnMissing = true;
    console.warn("[LINE webhook] column missing, skipping verification", err);
  }

  // Signature verification (skip if no secret configured — dev mode or
  // pre-migration env). channelSecret が null かつ columnMissing でも
  // ない場合は dev mode (= shops に secret 未設定環境) として通す。
  if (channelSecret) {
    const expected = crypto
      .createHmac("SHA256", channelSecret)
      .update(rawBody)
      .digest("base64");
    if (signature !== expected) {
      console.error("[LINE webhook] Signature mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  } else if (!columnMissing) {
    // dev: shops に secret 持ちが 0 件の状態。受け入れるが警告ログ。
    console.warn("[LINE webhook] no channel secret configured, skipping verification");
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
      //
      // LINE は webhook の応答を 1 秒以内に 200 で返す SLA を要求する。
      // 超過すると endpoint が無効化されるため、welcome の fetch +
      // line_messages 挿入は after() でレスポンス返却後に走らせる
      // (fire-and-forget)。after は Vercel runtime が完了まで関数を
      // 生かしてくれる。
      if (shopId) {
        const capturedShopId = shopId;
        const capturedReplyToken = event.replyToken;
        const capturedLineUserId = lineUserId;
        after(async () => {
          try {
            const { data: shop } = await supabase
              .from("shops")
              .select("name, line_channel_access_token")
              .eq("id", capturedShopId)
              .maybeSingle();
            const token = shop?.line_channel_access_token as string | null;
            const welcomeText = `友だち追加ありがとうございます！\n${
              (shop?.name as string) ?? "当院"
            }の予約リマインドをお届けします。\nご質問がありましたら、このトーク画面からお気軽にメッセージをお送りください。`;

            if (token && capturedReplyToken) {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  replyToken: capturedReplyToken,
                  messages: [{ type: "text", text: welcomeText }],
                }),
              });
            }

            await supabase.from("line_messages").insert({
              shop_id: capturedShopId,
              customer_id: await lookupCustomerId(capturedLineUserId),
              line_user_id: capturedLineUserId,
              direction: "outbound",
              message_type: "text",
              text: welcomeText,
              source: "follow_welcome",
              delivery_status: token ? "success" : "failed",
            });
          } catch (e) {
            console.error("[LINE webhook] welcome failed", e);
          }
        });
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
      //
      // 重複防止: LINE は webhook 失敗時 (200 以外 / 遅延) に再送する
      // 仕様。同じ message が 2 回届いても保存しないよう、
      // line_message_id を ON CONFLICT キーにして upsert する
      // (migration 00043 で line_message_id に partial UNIQUE 追加済)。
      // ignoreDuplicates により 2 通目は黙って無視される。
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

      const row = {
        shop_id: shopId,
        customer_id: customerId,
        line_user_id: lineUserId,
        direction: "inbound",
        message_type: type,
        text,
        line_message_id: msg.id ?? null,
        source: "webhook",
      };
      if (msg.id) {
        await supabase
          .from("line_messages")
          .upsert(row, {
            onConflict: "line_message_id",
            ignoreDuplicates: true,
          });
      } else {
        // line_message_id が無い (location 等) は upsert キーが無いので
        // 通常の insert。重複は事実上発生しないため許容。
        await supabase.from("line_messages").insert(row);
      }
    }
  }

  // LINE requires 200 within 1 second
  return NextResponse.json({ ok: true });
}
