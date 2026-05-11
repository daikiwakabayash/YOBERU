"use server";
import { createClient } from "@/helper/lib/supabase/server";
import { storeSchema } from "../schema/store.schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * FormData の boolean 文字列 ("true" / "false") を実際の boolean に
 * 戻す。`String(true)` / `String(false)` で append された値を zod の
 * `z.boolean()` に通すための変換ヘルパ。
 */
function toBool(v: FormDataEntryValue | undefined, fallback: boolean): boolean {
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

/**
 * フォーム送信値 (FormData) を zod スキーマが期待する型に揃える。
 * number 系は Number() で coerce し、boolean 系は toBool() で coerce する。
 *
 * 過去に `customer_can_cancel` / `customer_can_modify` の変換が漏れて
 * いて、フォーム保存が静かに失敗するバグがあった (LINE 設定が
 * いつまでも反映されない症状の根因)。boolean フィールドを 1 箇所に
 * 集約することで再発を防ぐ。
 */
function coerceStoreFormData(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return {
    ...raw,
    brand_id: Number(raw.brand_id),
    area_id: Number(raw.area_id),
    user_id: Number(raw.user_id),
    frame_min: Number(raw.frame_min),
    scale: Number(raw.scale),
    sort_number: Number(raw.sort_number || 0),
    is_public: toBool(raw.is_public, true),
    enable_meeting_booking: toBool(raw.enable_meeting_booking, true),
    customer_can_cancel: toBool(raw.customer_can_cancel, true),
    customer_can_modify: toBool(raw.customer_can_modify, false),
  };
}

export async function createStore(formData: FormData) {
  const supabase = await createClient();
  const parsed = storeSchema.safeParse(coerceStoreFormData(formData));

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.from("shops").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/store");
  redirect("/store");
}

export async function updateStore(id: number, formData: FormData) {
  const supabase = await createClient();
  const parsed = storeSchema.safeParse(coerceStoreFormData(formData));

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("shops")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/store");
  revalidatePath(`/store/${id}`);
  redirect("/store");
}

/**
 * Upload a shop logo to Supabase Storage and save the public URL.
 *
 * Expects a FormData with:
 *   - file: File (the image)
 *   - shop_id: string
 *
 * The file is stored in the `shop-logos` bucket at path `{shopId}/logo.{ext}`.
 * The bucket must be pre-created in Supabase Dashboard (Public: ON).
 */
export async function uploadShopLogo(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  const shopId = Number(formData.get("shop_id"));

  if (!file || !shopId) {
    return { error: "ファイルと店舗IDが必要です" };
  }

  // Validate file type and size
  const validTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!validTypes.includes(file.type)) {
    return { error: "PNG / JPEG / WebP / SVG のいずれかの画像を選択してください" };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { error: "ファイルサイズは 2MB 以内にしてください" };
  }

  const ext = file.name.split(".").pop() ?? "png";
  const filePath = `${shopId}/logo.${ext}`;
  const BUCKET = "shop-logos";

  // バケット存在チェックは行わない:
  //   - createBucket / getBucket は service_role 鍵が必要で anon では
  //     必ずエラーを返す。バケットが実在していても "見つかりません" と
  //     誤検出してしまう。
  //   - 実際にバケットが無い場合は upload 自体が "Bucket not found" を
  //     返すので、その時点で具体的な手順を案内すれば充分。

  // Upload (upsert so re-upload replaces the old logo)
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { upsert: true });
  if (uploadErr) {
    const msg = String(uploadErr.message ?? "");
    const low = msg.toLowerCase();
    if (low.includes("bucket") && low.includes("not found")) {
      return {
        error:
          "Supabase Storage に「shop-logos」バケットが見つかりません。" +
          "Supabase ダッシュボード → Storage → New bucket で「shop-logos」" +
          "（Public: ON）を作成してください。",
      };
    }
    if (
      low.includes("row-level security") ||
      low.includes("403") ||
      low.includes("unauthorized") ||
      low.includes("permission denied")
    ) {
      return {
        error:
          "shop-logos バケットへのアップロード権限がありません。" +
          "Supabase ダッシュボード → Storage → shop-logos → Policies で " +
          "INSERT / UPDATE を authenticated に許可してください。",
      };
    }
    return { error: `アップロードに失敗しました: ${msg}` };
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("shop-logos")
    .getPublicUrl(filePath);
  const logoUrl = urlData?.publicUrl;
  if (!logoUrl) {
    return { error: "公開 URL の取得に失敗しました" };
  }

  // Save to shops row
  const { error: updateErr } = await supabase
    .from("shops")
    .update({ logo_url: logoUrl })
    .eq("id", shopId);
  if (updateErr) {
    return { error: updateErr.message };
  }

  revalidatePath("/store");
  revalidatePath(`/store/${shopId}`);
  return { success: true, logoUrl };
}

export async function deleteStore(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shops")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/store");
}
