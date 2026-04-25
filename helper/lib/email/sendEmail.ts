/**
 * Email sender built on top of the Resend REST API (fetch-based; no SDK
 * dependency so we don't need to update package-lock.json).
 *
 * 迷惑メール対策 (Gmail / Yahoo 2024 新基準) の前提:
 *   - 送信元ドメイン (yurumu8.net) が Resend ダッシュボードで Verify 済
 *     であること。DKIM / SPF / DMARC の DNS レコードはそこで指示される
 *     (.env.example のコメント参照)。
 *   - From ドメインを一貫させる (= 常に YOBERU_MAIL_FROM)。
 *   - 返信可能な Reply-To を設定 (受信者とのエンゲージメント指標向上)。
 *   - HTML + Plain Text の multipart で送る (text-only はスパム判定寄り)。
 *
 * RESEND_API_KEY が未設定の場合は送信をスキップしてログのみ残す
 * (開発環境 / ローカルで API キーなしでもアプリがクラッシュしないように)。
 */

const DEFAULT_FROM = process.env.YOBERU_MAIL_FROM ?? "noreply@yurumu8.net";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain text body. HTML 版は自動生成される (\n → <br>) */
  body: string;
  /** From 表示名 (例: 店舗名)。指定時は "表示名 <noreply@yurumu8.net>" となる */
  fromName?: string;
  /** Reply-To アドレス。通常は店舗の連絡先 (shops.email1) を入れる */
  replyTo?: string | null;
  /**
   * HTML 本文を直接指定したいとき (給与計算の請求書 HTML など)。
   * 指定時は body の自動 HTML 生成を上書きする。プレーンテキストフォールバック
   * (text/plain) は body の値が引き続き使われる。
   */
  htmlBody?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  /** Resend が返す message id。デバッグ / 再送調査用 */
  messageId?: string;
}

/**
 * Plain text 本文を受け取り、安全な HTML 版を組み立てる。
 * 改行を <br> に変換し、HTML 特殊文字はエスケープする。
 */
function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const withBreaks = escaped.replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title></title>
  </head>
  <body style="margin:0;padding:24px;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;line-height:1.7;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
      <div style="white-space:pre-wrap;font-size:14px;">${withBreaks}</div>
    </div>
  </body>
</html>`;
}

/** RFC 5322 の quoted-string で From の表示名を安全にエンコードする。 */
function buildFromHeader(
  fromName: string | undefined,
  fromAddress: string
): string {
  if (!fromName) return fromAddress;
  const escaped = fromName.replace(/["\\]/g, "\\$&");
  return `"${escaped}" <${fromAddress}>`;
}

export async function sendEmail({
  to,
  subject,
  body,
  fromName,
  replyTo,
  htmlBody,
}: SendEmailInput): Promise<SendEmailResult> {
  if (!to) return { success: false, error: "宛先メールアドレスなし" };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendEmail] RESEND_API_KEY 未設定のため送信をスキップ", {
      to,
      subject: subject.slice(0, 60),
    });
    return { success: false, error: "RESEND_API_KEY 未設定" };
  }

  const from = buildFromHeader(fromName, DEFAULT_FROM);
  // 呼び出し元で HTML を組み立てたいケース (請求書) は htmlBody を優先。
  // 指定がなければ従来どおり body から auto-generate する。
  const html = htmlBody ?? plainTextToHtml(body);

  const payload: Record<string, unknown> = {
    from,
    to,
    subject,
    text: body,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Resend は失敗時 { name, message } を返す
      let errorMessage = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { message?: string; name?: string };
        errorMessage = err.message ?? err.name ?? errorMessage;
      } catch {
        /* body 無し or 非 JSON: デフォルトメッセージで返す */
      }
      return { success: false, error: errorMessage };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
