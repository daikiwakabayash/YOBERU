"use server";

import { createClient } from "@/helper/lib/supabase/server";
import type {
  AttachmentType,
  CustomerAttachment,
} from "../types";

const BUCKET = "customer-attachments";

/**
 * 顧客に紐付く添付ファイル一覧を取得する。appointmentId を渡した場合は
 * その予約に紐付くものだけを返す。
 *
 * 画像の表示 URL は Supabase Storage の signed URL で 1 時間有効。
 * 非公開バケットを前提とする (migration 00028)。
 */
export async function getCustomerAttachments(params: {
  customerId: number;
  appointmentId?: number | null;
}): Promise<CustomerAttachment[]> {
  const supabase = await createClient();

  let q = supabase
    .from("customer_attachments")
    .select(
      "id, brand_id, shop_id, customer_id, appointment_id, file_path, file_name, mime_type, size_bytes, attachment_type, memo, uploaded_by_staff_id, created_at, staffs(name)"
    )
    .eq("customer_id", params.customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params.appointmentId != null) {
    q = q.eq("appointment_id", params.appointmentId);
  }

  const { data } = await q;

  const rows = (data ?? []) as Array<{
    id: number;
    brand_id: number;
    shop_id: number;
    customer_id: number;
    appointment_id: number | null;
    file_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    attachment_type: string;
    memo: string | null;
    uploaded_by_staff_id: number | null;
    created_at: string;
    staffs:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  }>;

  // Signed URL をまとめて発行。Supabase JS は 1 つずつしか作れないので
  // Promise.all で並列化。ファイル数 ~数十件の想定なので許容範囲。
  const withUrls = await Promise.all(
    rows.map(async (r) => {
      const staff = Array.isArray(r.staffs) ? r.staffs[0] ?? null : r.staffs;
      let url: string | null = null;
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(r.file_path, 60 * 60);
      if (signed?.signedUrl) url = signed.signedUrl;
      return {
        id: r.id,
        brandId: r.brand_id,
        shopId: r.shop_id,
        customerId: r.customer_id,
        appointmentId: r.appointment_id,
        filePath: r.file_path,
        fileName: r.file_name,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        attachmentType:
          (r.attachment_type as AttachmentType | undefined) ?? "other",
        memo: r.memo,
        uploadedByStaffId: r.uploaded_by_staff_id,
        uploadedByStaffName: staff?.name ?? null,
        createdAt: r.created_at,
        url,
      } satisfies CustomerAttachment;
    })
  );

  return withUrls;
}
