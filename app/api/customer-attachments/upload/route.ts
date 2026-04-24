import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AttachmentType } from "@/feature/customer-attachment/types";

// 必ずサーバー側で動的に処理する (cookie 経由の認証 + FormData multipart)。
// runtime=nodejs にして Edge ではなく Node ランタイム強制
// (Supabase Storage SDK の Buffer 依存を確実に動かすため)。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 1 ファイル上限 10MB を許容するため Vercel デフォルトの 4.5MB を回避。
// Pro プランは 1 ファイル最大 ~30MB まで実行可能。
export const maxDuration = 30;

/**
 * カルテ添付ファイルのアップロード専用エンドポイント。
 *
 * なぜ Route Handler ?
 *   Server Action で FormData に File を入れて programmatic 呼び出しすると、
 *   Next.js 16 + Turbopack 環境で File のシリアライズが落ち、サーバー側で
 *   formData.get("file") が空になる現象があるため。
 *   Route Handler なら fetch でそのまま multipart/form-data が送られるので
 *   確実に File が到達する。
 *
 * 期待するフォームフィールド (multipart/form-data):
 *   - file            : File
 *   - brand_id        : number
 *   - shop_id         : number
 *   - customer_id     : number
 *   - appointment_id  : number (optional)
 *   - attachment_type : 'before' | 'after' | 'memo' | 'other'
 *   - memo            : string (optional)
 */

const BUCKET = "customer-attachments";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
];

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[/api/customer-attachments/upload] formData parse failed", e);
    return NextResponse.json(
      { error: "リクエストの形式が不正です (FormData として読めません)" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    console.warn("[/api/customer-attachments/upload] no file in FormData", {
      fileType: typeof file,
      isFile: file instanceof File,
      size: file instanceof File ? file.size : undefined,
      keys: Array.from(formData.keys()),
    });
    return NextResponse.json(
      { error: "ファイルが選択されていません" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "ファイルサイズが 10MB を超えています" },
      { status: 413 }
    );
  }
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `このファイル形式は添付できません (${file.type || "不明"})` },
      { status: 415 }
    );
  }

  const brandId = Number(formData.get("brand_id"));
  const shopId = Number(formData.get("shop_id"));
  const customerId = Number(formData.get("customer_id"));
  if (!brandId || !shopId || !customerId) {
    return NextResponse.json(
      { error: "brand_id / shop_id / customer_id が不正です" },
      { status: 400 }
    );
  }

  const apptRaw = formData.get("appointment_id");
  const appointmentId = apptRaw ? Number(apptRaw) : null;
  const attachmentType = String(
    formData.get("attachment_type") || "other"
  ) as AttachmentType;
  const memo = String(formData.get("memo") || "") || null;

  const supabase = await createClient();

  // 明示的に認証ユーザーを確認 (middleware 任せだが二重チェック)
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    console.error("[/api/customer-attachments/upload] not authenticated", authErr);
    return NextResponse.json(
      { error: "ログインが切れています。ページを再読み込みしてログインし直してください。" },
      { status: 401 }
    );
  }

  // ファイル名サニタイズ: path separator と空白/ハイフンを _ に。
  const safeName = file.name
    .replace(/[\\/]/g, "_")
    .replace(/[\s-]+/g, "_");

  const timestamp = Date.now();
  const filePath = `shop_${shopId}/customer_${customerId}/${timestamp}_${safeName}`;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (e) {
    console.error(
      "[/api/customer-attachments/upload] arrayBuffer failed",
      e
    );
    return NextResponse.json(
      {
        error:
          "ファイルの読み込みに失敗しました。ブラウザを更新して再度お試しください。",
      },
      { status: 500 }
    );
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    const msg = upErr.message ?? "";
    console.error("[/api/customer-attachments/upload] storage upload failed", {
      msg,
      filePath,
      size: file.size,
      mime: file.type,
    });
    const low = msg.toLowerCase();
    if (low.includes("bucket") && low.includes("not found")) {
      return NextResponse.json(
        {
          error:
            "Supabase Storage に 'customer-attachments' バケットが作成されていません。Supabase Studio → Storage で非公開バケットとして作成してください。",
        },
        { status: 500 }
      );
    }
    if (
      low.includes("new row violates row-level security") ||
      low.includes("403") ||
      low.includes("unauthorized") ||
      low.includes("permission denied")
    ) {
      return NextResponse.json(
        {
          error:
            "Storage の RLS ポリシーが未適用、またはバケットが非公開ではありません。マイグレーション 00028_customer_attachments_storage_policies.sql を実行し、バケットを非公開で作成してください。",
        },
        { status: 500 }
      );
    }
    if (
      low.includes("payload") ||
      low.includes("too large") ||
      low.includes("413")
    ) {
      return NextResponse.json(
        {
          error:
            "ファイルサイズが大きすぎます。10MB 以下の画像に圧縮してから再度アップロードしてください。",
        },
        { status: 413 }
      );
    }
    if (low.includes("duplicate") || low.includes("already exists")) {
      return NextResponse.json(
        {
          error:
            "同じファイル名が直前にアップロードされています。数秒待ってから再度お試しください。",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: `アップロード失敗: ${msg}` },
      { status: 500 }
    );
  }

  const { data: inserted, error: dbErr } = await supabase
    .from("customer_attachments")
    .insert({
      brand_id: brandId,
      shop_id: shopId,
      customer_id: customerId,
      appointment_id: appointmentId,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      attachment_type: attachmentType,
      memo,
    })
    .select("id")
    .single();

  if (dbErr) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    const msg = dbErr.message ?? "";
    console.error("[/api/customer-attachments/upload] DB insert failed", {
      msg,
      filePath,
      customerId,
    });
    if (
      msg.includes("customer_attachments") &&
      (msg.includes("does not exist") || msg.includes("schema cache"))
    ) {
      return NextResponse.json(
        {
          error:
            "customer_attachments テーブルが未作成です。マイグレーション 00027_reengagement_auto_send_and_attachments.sql を実行してください。",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: `DB 記録失敗: ${msg}` },
      { status: 500 }
    );
  }

  revalidatePath(`/customer/${customerId}/record`);
  revalidatePath(`/customer/${customerId}`);
  revalidatePath("/reservation");
  return NextResponse.json({ success: true, id: inserted.id });
}
