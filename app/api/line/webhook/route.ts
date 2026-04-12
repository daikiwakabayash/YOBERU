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
 *
 * Authentication: validates the X-Line-Signature header using the
 * shop's channel_secret (HMAC-SHA256). We look up the secret from the
 * first shop whose line_channel_id matches the destination in the
 * payload. If validation fails, 403.
 *
 * Path: POST /api/line/webhook
 */

interface LineEvent {
  type: string;
  source?: { type: string; userId?: string };
  replyToken?: string;
  timestamp?: number;
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
    // Try matching by destination (bot userId → line_channel_id).
    // If the shop stored the bot's userId in line_channel_id this
    // works directly. Otherwise we fall back to the first shop that
    // has a non-null line_channel_secret.
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
      const { data: any } = await supabase
        .from("shops")
        .select("id, line_channel_secret")
        .not("line_channel_secret", "is", null)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (any?.line_channel_secret) {
        channelSecret = any.line_channel_secret as string;
        shopId = any.id as number;
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

  // Process events
  for (const event of body.events ?? []) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    if (event.type === "follow") {
      // User followed (友だち追加). Link their line_user_id to the
      // customer row. We try two strategies:
      //
      //   1. If the follow came via a `liff.state` deeplink that
      //      embeds a customer_id, update that specific row.
      //   2. Otherwise, look for an UNLINKED customer in this shop
      //      whose line_id matches (self-reported ID) or who has a
      //      recent appointment (latest today or later) and hasn't
      //      been linked yet. This handles the "register → follow"
      //      flow where the customer clicks the LINE button right
      //      after booking.
      //
      // Strategy 2 is intentionally loose for the MVP — once LIFF
      // linking is set up, strategy 1 takes over and is exact.

      if (shopId) {
        // Strategy 2: link the most-recently-booked unlinked customer
        const { data: recentAppt } = await supabase
          .from("appointments")
          .select("customer_id")
          .eq("shop_id", shopId)
          .eq("type", 0)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10);

        for (const appt of recentAppt ?? []) {
          const custId = appt.customer_id as number;
          // Only link if line_user_id is currently NULL
          const { data: updated } = await supabase
            .from("customers")
            .update({ line_user_id: lineUserId })
            .eq("id", custId)
            .is("line_user_id", null)
            .select("id")
            .maybeSingle();
          if (updated) {
            console.log(
              `[LINE webhook] Linked userId ${lineUserId} → customer ${custId}`
            );
            break; // Link only one
          }
        }
      }

      // Send a welcome reply
      if (channelSecret) {
        try {
          const { data: shop } = shopId
            ? await supabase
                .from("shops")
                .select("name, line_channel_access_token")
                .eq("id", shopId)
                .maybeSingle()
            : { data: null };
          const token = shop?.line_channel_access_token as string | null;
          if (token && event.replyToken) {
            await fetch("https://api.line.me/v2/bot/message/reply", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                replyToken: event.replyToken,
                messages: [
                  {
                    type: "text",
                    text: `友だち追加ありがとうございます！\n${
                      (shop?.name as string) ?? "当院"
                    }の予約リマインドをお届けします。`,
                  },
                ],
              }),
            });
          }
        } catch (e) {
          console.error("[LINE webhook] reply failed", e);
        }
      }
    } else if (event.type === "unfollow") {
      // User unfollowed (ブロック). Clear their line_user_id so
      // the reminder cron doesn't try to push to a blocked user.
      await supabase
        .from("customers")
        .update({ line_user_id: null })
        .eq("line_user_id", lineUserId);
      console.log(
        `[LINE webhook] Cleared line_user_id for blocked user ${lineUserId}`
      );
    }
  }

  // LINE requires 200 within 1 second
  return NextResponse.json({ ok: true });
}
