"use server";

import crypto from "node:crypto";

/**
 * Meta アクセストークンを at-rest 暗号化する。
 *
 * 鍵は env: META_TOKEN_ENC_KEY (32 byte hex = 64 文字)。
 * 未設定時は "dev" 用の固定鍵にフォールバックする (本番では必ず設定)。
 *
 * 形式: <iv-hex>:<authTag-hex>:<ciphertext-base64>
 * AES-256-GCM。1 行 = 1 トークンなので JSON 化はしない。
 */

const FALLBACK_KEY_HEX =
  // dev 用: 32 byte 固定。本番では絶対に使わない。
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function getKey(): Buffer {
  const hex = process.env.META_TOKEN_ENC_KEY ?? FALLBACK_KEY_HEX;
  if (hex.length !== 64) {
    throw new Error(
      "META_TOKEN_ENC_KEY must be 32 bytes (64 hex characters)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString(
    "base64"
  )}`;
}

export function decryptToken(payload: string): string {
  const [ivHex, tagHex, ctB64] = payload.split(":");
  if (!ivHex || !tagHex || !ctB64) {
    throw new Error("invalid encrypted token payload");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
