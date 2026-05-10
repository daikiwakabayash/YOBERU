import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import crypto from "crypto";

/**
 * LINE Messaging API Webhook endpoint.
 *
 * 仕様変更 (migration 00047):
 *   - 旧: follow 時に「最近予約した未紐付け顧客」を自動で line_user_id に
 *         埋める実装だったが、同時間帯に複数の予約者が follow するなど
 *         のケースで誤った顧客に紐付き、リマインドの誤送信を引き起こす
 *         ため、廃止した。
 *   - 新: follow 時は `pending_line_links` に保留行を作成する。スタッフが
 *         ダッシュボード `/line-link-queue` で目視マッチさせる。
 *
 * 受信イベント:
 *   - follow:   pending_line_links に upsert (LINE プロフィールも取得)
 *   - unfollow: line_user_id / 保留行をクリア
 *   - message:  line_messages に inbound として保存
 *
 * 認証: X-Line-Signature ヘッダを shop.line_channel_secret で HMAC-SHA256
 *       検証する。destination 一致 shop が見つからない場合は 403 を返す
 *       (旧実装の「任意 shop fallback」は多店舗で混線するため廃止)。
 *
 * Path: POST /api/line/webhook
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

interface LineProfile {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  statusMessage?: string;
}

async function fetchLineProfile(
  userId: string,
  channelAccessToken: string
): Promise<LineProfile | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as LineProfile;
  } catch {
    return null;
  }
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

  // destination (bot の userId) で shop を一意に特定する。
  // 旧実装ではここで見つからない時に「最初の任意 shop」の secret で
  // 検証する fallback を持っていたが、複数店舗で複数 channel を持つ
  // 運用では他店舗のリクエストを受理してしまう危険があるため廃止。
  let channelSecret: string | null = null;
  let channelAccessToken: string | null = null;
  let shopId: number | null = null;

  try {
    if (body.destination) {
      const { data: shopRow } = await supabase
        .from("shops")
        .select("id, line_channel_secret, line_channel_access_token")
        .eq("line_channel_id", body.destination)
        .is("deleted_at", null)
        .maybeSingle();
      if (shopRow?.line_channel_secret) {
        channelSecret = shopRow.line_channel_secret as string;
        channelAccessToken =
          (shopRow.line_channel_access_token as string | null) ?? null;
        shopId = shopRow.id as number;
      }
    }
  } catch {
    // shops に LINE カラムがまだ無い (migration 00013 未適用) 環境では
    // 検証ができないので、200 を返してエンドポイントを生かしておく
    // (LINE 側で webhook 無効化されると復旧が面倒なため)。
    console.warn("[LINE webhook] shops の LINE カラム未セットアップ");
    return NextResponse.json({ ok: true, warn: "not configured" });
  }

  if (!shopId || !channelSecret) {
    console.error(
      `[LINE webhook] destination=${body.destination} に対応する shop が見つかりません`
    );
    return NextResponse.json(
      { error: "Unknown destination" },
      { status: 403 }
    );
  }

  // Signature verification
  const expected = crypto
    .createHmac("SHA256", channelSecret)
    .update(rawBody)
    .digest("base64");
  if (signature !== expected) {
    console.error("[LINE webhook] Signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
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

  for (const event of body.events ?? []) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    if (event.type === "follow") {
      // 既に customers.line_user_id に紐付け済の人が再 follow する
      // パターンもあるので、その場合は何もしない (welcome 返信のみ)。
      const alreadyLinked = await lookupCustomerId(lineUserId);

      // LINE プロフィールを取得し、保留キューに upsert。
      // (アクセストークン未設定なら profile 取得は諦め、name/picture は
      //  null のまま行を作る。スタッフは LINE 画面で名前を確認する。)
      let profile: LineProfile | null = null;
      if (channelAccessToken) {
        profile = await fetchLineProfile(lineUserId, channelAccessToken);
      }

      if (!alreadyLinked) {
        try {
          await supabase.from("pending_line_links").upsert(
            {
              shop_id: shopId,
              line_user_id: lineUserId,
              display_name: profile?.displayName ?? null,
              picture_url: profile?.pictureUrl ?? null,
              status_message: profile?.statusMessage ?? null,
              followed_at: new Date().toISOString(),
              matched_customer_id: null,
              matched_at: null,
              dismissed_at: null,
              dismissed_by_user_id: null,
              dismissed_reason: null,
              deleted_at: null,
            },
            { onConflict: "shop_id,line_user_id" }
          );
        } catch (e) {
          console.error("[LINE webhook] pending_line_links upsert 失敗", e);
        }
      }

      // welcome 返信は送らない。LINE の自動送信は予約リマインド (cron)
      // だけに限定する運用方針のため。友だち追加してきた直後にこちらから
      // 自動メッセージを送ると、保留キューの紐付け前にトーク履歴が
      // 混ざるという副作用もある。挨拶が必要であれば LINE 公式アカウントの
      // 「あいさつメッセージ」機能 (Messaging API ではなく LINE 側機能)
      // を利用する。
    } else if (event.type === "unfollow") {
      // ブロック / 友だち削除。 line_user_id を顧客側から外し、保留行も
      // 「dismissed」扱いにして残す (監査用)。
      await supabase
        .from("customers")
        .update({ line_user_id: null })
        .eq("line_user_id", lineUserId);

      try {
        await supabase
          .from("pending_line_links")
          .update({
            dismissed_at: new Date().toISOString(),
            dismissed_reason: "ユーザがブロック / 友だち削除",
          })
          .eq("shop_id", shopId)
          .eq("line_user_id", lineUserId)
          .is("matched_customer_id", null)
          .is("dismissed_at", null);
      } catch (e) {
        console.error("[LINE webhook] pending dismiss 失敗", e);
      }

      await supabase.from("line_messages").insert({
        shop_id: shopId,
        line_user_id: lineUserId,
        direction: "inbound",
        message_type: "system",
        text: "(ブロック / 友だち削除)",
        source: "webhook",
      });
      console.log(
        `[LINE webhook] Cleared line_user_id for blocked user ${lineUserId}`
      );
    } else if (event.type === "message") {
      // 受信メッセージはチャット表示用に保存。
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

  return NextResponse.json({ ok: true });
}
