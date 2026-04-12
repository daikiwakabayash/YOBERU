"use server";
import { createClient } from "@/helper/lib/supabase/server";
import { storeSchema } from "../schema/store.schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createStore(formData: FormData) {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());

  const parsed = storeSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    area_id: Number(raw.area_id),
    user_id: Number(raw.user_id),
    frame_min: Number(raw.frame_min),
    scale: Number(raw.scale),
    sort_number: Number(raw.sort_number || 0),
    is_public: raw.is_public === "true",
    enable_meeting_booking: raw.enable_meeting_booking !== "false",
  });

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
  const raw = Object.fromEntries(formData.entries());

  const parsed = storeSchema.safeParse({
    ...raw,
    brand_id: Number(raw.brand_id),
    area_id: Number(raw.area_id),
    user_id: Number(raw.user_id),
    frame_min: Number(raw.frame_min),
    scale: Number(raw.scale),
    sort_number: Number(raw.sort_number || 0),
    is_public: raw.is_public === "true",
    enable_meeting_booking: raw.enable_meeting_booking !== "false",
  });

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
 * Creates the bucket if it doesn't exist (public, with 2MB file size limit).
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

  // Ensure bucket exists. createBucket returns { error } (doesn't throw).
  // "already exists" or "Bucket already exists" is fine — anything else
  // means the anon key doesn't have create-bucket permission and the
  // user needs to create it via the Supabase Dashboard.
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
  });
  if (bucketErr) {
    const msg = String(bucketErr.message ?? "");
    const alreadyExists =
      msg.includes("already exists") || msg.includes("Duplicate");
    if (!alreadyExists) {
      // Bucket doesn't exist and we can't create it. Check if it exists
      // already (maybe RLS blocks createBucket but allows upload).
      const { error: getErr } = await supabase.storage.getBucket(BUCKET);
      if (getErr) {
        return {
          error:
            "Supabase Storage に「shop-logos」バケットが見つかりません。" +
            "Supabase ダッシュボード → Storage → New bucket で「shop-logos」" +
            "（Public: ON）を作成してください。",
        };
      }
    }
  }

  // Upload (upsert so re-upload replaces the old logo)
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { upsert: true });
  if (uploadErr) {
    return { error: `アップロードに失敗しました: ${uploadErr.message}` };
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
