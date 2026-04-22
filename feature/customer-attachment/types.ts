export type AttachmentType = "before" | "after" | "memo" | "other";

export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  before: "施術前",
  after: "施術後",
  memo: "メモ",
  other: "その他",
};

export const ATTACHMENT_TYPE_COLORS: Record<AttachmentType, string> = {
  before: "bg-orange-100 text-orange-700",
  after: "bg-emerald-100 text-emerald-700",
  memo: "bg-blue-100 text-blue-700",
  other: "bg-gray-100 text-gray-600",
};

export interface CustomerAttachment {
  id: number;
  brandId: number;
  shopId: number;
  customerId: number;
  appointmentId: number | null;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  attachmentType: AttachmentType;
  memo: string | null;
  uploadedByStaffId: number | null;
  uploadedByStaffName: string | null;
  createdAt: string;
  /** Supabase Storage signed URL (1 時間有効)。非公開バケットの表示に使う */
  url: string | null;
}
