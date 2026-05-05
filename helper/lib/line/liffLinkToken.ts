import crypto from "crypto";

/**
 * 予約完了画面 → LIFF 経由で「この LINE userId を customer_id に紐付ける」
 * 署名付きトークン。
 *
 * 形式: base64url(payload).base64url(hmac_sha256(secret, payload))
 *   payload = JSON({ cid, exp })
 *     cid: customers.id
 *     exp: 失効 unix 秒
 *
 * 秘密鍵は LIFF_LINK_SECRET env。未設定なら null を返して機能 OFF にする
 * (= 予約完了画面の LINE 連携ボタンが表示されず、verify も常に失敗)。
 *
 * 旧実装は CRON_SECRET をフォールバックに使っていたが、cron 認可と
 * 顧客紐付け署名で同じ秘密鍵を共有することになり、片方が漏えいすると
 * もう片方も破られるため廃止。両者は用途・公開範囲が異なる。
 */

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 日

function getSecret(): string | null {
  return process.env.LIFF_LINK_SECRET || null;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signLinkToken(customerId: number, ttlSec = DEFAULT_TTL_SEC): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload = JSON.stringify({
    cid: customerId,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  });
  const payloadB64 = b64url(Buffer.from(payload, "utf8"));
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export interface VerifiedLinkToken {
  customerId: number;
}

export function verifyLinkToken(token: string): VerifiedLinkToken | null {
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  let payload: { cid?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  const cid = typeof payload.cid === "number" ? payload.cid : NaN;
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!Number.isFinite(cid) || cid <= 0) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;

  return { customerId: cid };
}
