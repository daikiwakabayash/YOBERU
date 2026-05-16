"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getNextCustomerCode } from "../services/getNextCustomerCode";
import { getActiveBrandId } from "@/helper/lib/shop-context";
import { revalidatePath } from "next/cache";

/**
 * 顧客 CSV インポート用 Server Action.
 *
 * 想定 CSV カラム順 (1 行目 = ヘッダ):
 *   番号, 氏名, 郵便番号, 住所1, 電話番号, 性別, 生年月日, 年齢, ...
 *
 * - 氏名は空白で姓 / 名に分割 (空白なしなら全部 last_name)
 * - 電話番号は数字以外を除去し下 11 桁を採用
 * - 郵便番号は数字以外を除去し最初の 7 桁を採用
 * - 性別は「男性」→ 1, 「女性」→ 2, それ以外 → 0
 * - 生年月日は YYYY/M/D / YYYY-MM-DD / YYYY年M月D日 を YYYY-MM-DD に正規化
 * - 電話番号で既存 customer と重複したらスキップ
 * - 1 行ずつ insert (失敗行は理由を記録してスキップ続行)
 */

export interface ImportRowInput {
  /** スプレッドシートの「氏名」セル */
  name: string;
  /** 「郵便番号」セル */
  zipCode?: string;
  /** 「住所1」セル */
  address?: string;
  /** 「電話番号」セル */
  phoneNumber?: string;
  /** 「性別」セル (男性 / 女性 / その他) */
  gender?: string;
  /** 「生年月日」セル (YYYY/M/D 等) */
  birthDate?: string;
}

export interface ImportRowResult {
  rowIndex: number;
  name: string;
  status: "created" | "skipped";
  reason?: string;
  customerCode?: string;
}

export interface ImportCustomersResult {
  ok: boolean;
  shopId: number;
  total: number;
  created: number;
  skipped: number;
  rows: ImportRowResult[];
  error?: string;
}

function normalizeName(raw: string): { last: string; first: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { last: "", first: "" };
  // 全角スペースを半角に揃えて split
  const parts = trimmed.replace(/　/g, " ").split(/\s+/);
  if (parts.length === 1) {
    return { last: parts[0].slice(0, 32), first: "" };
  }
  return {
    last: parts[0].slice(0, 32),
    first: parts.slice(1).join(" ").slice(0, 32),
  };
}

function normalizePhone(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // VARCHAR(11) なので下 11 桁を採用
  return digits.slice(-11);
}

function normalizeZip(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // VARCHAR(7) なので最初の 7 桁
  return digits.slice(0, 7);
}

function normalizeGender(raw: string | undefined): number {
  const v = (raw ?? "").trim();
  if (v === "男性" || v === "男" || v.toLowerCase() === "male" || v === "M" || v === "m") return 1;
  if (v === "女性" || v === "女" || v.toLowerCase() === "female" || v === "F" || v === "f") return 2;
  return 0;
}

function normalizeBirthDate(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  // 1993/5/3 や 1993-05-03 や 1993年5月3日 などを拾う
  const m = v.match(/^(\d{4})[年/\-.](\d{1,2})[月/\-.](\d{1,2})日?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function importCustomers(
  shopId: number,
  rows: ImportRowInput[]
): Promise<ImportCustomersResult> {
  const supabase = await createClient();
  const brandId = await getActiveBrandId();

  if (!shopId || shopId <= 0) {
    return {
      ok: false,
      shopId: 0,
      total: 0,
      created: 0,
      skipped: 0,
      rows: [],
      error: "店舗が選択されていません。先に店舗を選択してください",
    };
  }
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      shopId,
      total: 0,
      created: 0,
      skipped: 0,
      rows: [],
      error: "インポートするデータがありません",
    };
  }

  // 既存電話番号を一括取得して重複チェックに使う
  const { data: existing } = await supabase
    .from("customers")
    .select("phone_number_1")
    .eq("shop_id", shopId)
    .is("deleted_at", null);
  const existingPhones = new Set<string>(
    ((existing ?? []) as Array<{ phone_number_1: string | null }>)
      .map((r) => r.phone_number_1 ?? "")
      .filter(Boolean)
  );

  const results: ImportRowResult[] = [];
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;
    const { last, first } = normalizeName(row.name ?? "");
    const fullName = [last, first].filter(Boolean).join(" ") || "(氏名未入力)";

    if (!last && !first) {
      results.push({
        rowIndex,
        name: fullName,
        status: "skipped",
        reason: "氏名が空です",
      });
      skipped += 1;
      continue;
    }

    const phone = normalizePhone(row.phoneNumber);
    if (phone && existingPhones.has(phone)) {
      results.push({
        rowIndex,
        name: fullName,
        status: "skipped",
        reason: `電話番号 ${phone} の顧客が既に登録されています`,
      });
      skipped += 1;
      continue;
    }

    const zip = normalizeZip(row.zipCode);
    const address = (row.address ?? "").trim().slice(0, 255);
    const gender = normalizeGender(row.gender);
    const birthDate = normalizeBirthDate(row.birthDate);

    // カルテ番号採番 (1 件ずつ最小の空き番号を使う)
    const nextCode = await getNextCustomerCode(supabase, shopId);

    const insertData: Record<string, unknown> = {
      brand_id: brandId,
      shop_id: shopId,
      code: nextCode,
      type: 0,
      last_name: last || null,
      first_name: first || null,
      phone_number_1: phone || "00000000000",
      zip_code: zip || "0000000",
      address: address || null,
      gender,
      birth_date: birthDate,
    };

    const { error } = await supabase.from("customers").insert(insertData);
    if (error) {
      results.push({
        rowIndex,
        name: fullName,
        status: "skipped",
        reason: `DB エラー: ${error.message}`,
      });
      skipped += 1;
      continue;
    }

    if (phone) existingPhones.add(phone);
    created += 1;
    results.push({
      rowIndex,
      name: fullName,
      status: "created",
      customerCode: nextCode,
    });
  }

  if (created > 0) {
    revalidatePath("/customer");
  }

  return {
    ok: true,
    shopId,
    total: rows.length,
    created,
    skipped,
    rows: results,
  };
}
