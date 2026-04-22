/**
 * LINE Messaging API (push message) 送信ヘルパ。
 *
 * push message は「follow 済ユーザー」にしか送れないので、呼び出し側は
 * 事前に customers.line_user_id が埋まっていること (= そのユーザーが
 * 店舗の公式アカウントを友だち追加済) を確認する。
 *
 * SDK ではなく fetch ベース。package.json 変更を避けるための方針は
 * sendEmail.ts と同じ。
 *
 * ---
 * 参考 (LINE Messaging API):
 *   POST https://api.line.me/v2/bot/message/push
 *   Authorization: Bearer <channel access token>
 *   Content-Type: application/json
 *   Body: { "to": "<userId>", "messages": [{ "type": "text", "text": "..." }] }
 *
 * channel access token は shops.line_channel_access_token に格納されて
 * いる前提 (migration 00013)。
 */

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

export interface SendLineInput {
  /** 送信先の LINE userId (customers.line_user_id) */
  to: string;
  /** 本文 (text)。5000 文字まで。改行 OK */
  text: string;
  /** 店舗の channel access token (shops.line_channel_access_token) */
  channelAccessToken: string;
}

export interface SendLineResult {
  success: boolean;
  error?: string;
  /** LINE が返す X-Line-Request-Id (配信調査用) */
  requestId?: string;
}

export async function sendLineMessage(
  input: SendLineInput
): Promise<SendLineResult> {
  if (!input.channelAccessToken) {
    return {
      success: false,
      error: "LINE channel_access_token が設定されていません",
    };
  }
  if (!input.to) {
    return { success: false, error: "送信先 userId が空です" };
  }

  // 5000 文字上限。超える場合は末尾を truncate。
  const text =
    input.text.length > 4990
      ? `${input.text.slice(0, 4990)}...(以下省略)`
      : input.text;

  try {
    const res = await fetch(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channelAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: input.to,
        messages: [{ type: "text", text }],
      }),
    });

    const requestId = res.headers.get("x-line-request-id") ?? undefined;

    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { message?: string };
        detail = j?.message ?? "";
      } catch {
        /* ignore */
      }
      return {
        success: false,
        error: `LINE 送信失敗 (status=${res.status}) ${detail}`.trim(),
        requestId,
      };
    }

    return { success: true, requestId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "LINE 送信時の例外",
    };
  }
}
