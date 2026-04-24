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

  // staffs(name) の implicit join は customer_attachments → staffs の FK
  // 名が PostgREST に推論できないと失敗する (schema cache の再読み込み
  // タイミングも要因)。失敗したら FK 無し SELECT にフォールバックして、
  // スタッフ名だけ後から別取得で埋める。
  //
  // これがないと「アップロードには成功しているが一覧に出ない」状態に陥る。
  const FULL_SELECT =
    "id, brand_id, shop_id, customer_id, appointment_id, file_path, file_name, mime_type, size_bytes, attachment_type, memo, uploaded_by_staff_id, created_at, staffs(name)";
  const SAFE_SELECT =
    "id, brand_id, shop_id, customer_id, appointment_id, file_path, file_name, mime_type, size_bytes, attachment_type, memo, uploaded_by_staff_id, created_at";

  function buildQuery(select: string) {
    let q = supabase
      .from("customer_attachments")
      .select(select)
      .eq("customer_id", params.customerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (params.appointmentId != null) {
      q = q.eq("appointment_id", params.appointmentId);
    }
    return q;
  }

  let qRes = await buildQuery(FULL_SELECT);
  if (qRes.error) {
    console.error(
      "[getCustomerAttachments] full SELECT failed, retrying SAFE select",
      qRes.error
    );
    qRes = await buildQuery(SAFE_SELECT);
    if (qRes.error) {
      console.error(
        "[getCustomerAttachments] SAFE SELECT also failed",
        qRes.error
      );
      return [];
    }
  }
  const data = qRes.data;

  const rows = (data ?? []) as unknown as Array<{
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
    staffs?:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  }>;

  // SAFE SELECT fallback で staffs join が無かった場合は、
  // uploaded_by_staff_id から個別取得して埋める (Map lookup パターン)。
  const staffIds = Array.from(
    new Set(
      rows
        .map((r) => r.uploaded_by_staff_id)
        .filter((x): x is number => typeof x === "number")
    )
  );
  const staffNameMap = new Map<number, string>();
  if (staffIds.length > 0 && rows.some((r) => r.staffs == null)) {
    const { data: staffs } = await supabase
      .from("staffs")
      .select("id, name")
      .in("id", staffIds);
    for (const s of (staffs ?? []) as Array<{ id: number; name: string }>) {
      staffNameMap.set(s.id, s.name);
    }
  }

  // Signed URL をまとめて発行。Supabase JS は 1 つずつしか作れないので
  // Promise.all で並列化。ファイル数 ~数十件の想定なので許容範囲。
  const withUrls = await Promise.all(
    rows.map(async (r) => {
      const joinedStaff = Array.isArray(r.staffs)
        ? r.staffs[0] ?? null
        : r.staffs ?? null;
      const staffName =
        joinedStaff?.name ??
        (r.uploaded_by_staff_id != null
          ? (staffNameMap.get(r.uploaded_by_staff_id) ?? null)
          : null);
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
        uploadedByStaffName: staffName,
        createdAt: r.created_at,
        url,
      } satisfies CustomerAttachment;
    })
  );

  return withUrls;
}
