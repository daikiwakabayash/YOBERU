"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Camera, ImagePlus, FileText, Trash2, X, Download } from "lucide-react";
import { toast } from "sonner";
import {
  uploadCustomerAttachment,
  deleteCustomerAttachment,
} from "../actions/attachmentActions";
import {
  ATTACHMENT_TYPE_COLORS,
  ATTACHMENT_TYPE_LABELS,
  type AttachmentType,
  type CustomerAttachment,
} from "../types";

interface AttachmentGalleryProps {
  brandId: number;
  shopId: number;
  customerId: number;
  /** 予約単位の添付にしたい場合に指定。顧客単位にしたいなら undefined。 */
  appointmentId?: number | null;
  attachments: CustomerAttachment[];
  /** コンパクト表示 (カルテ横サムネ用)。false なら上部にアップロードボタン + 設定UI。 */
  compact?: boolean;
}

export function AttachmentGallery({
  brandId,
  shopId,
  customerId,
  appointmentId,
  attachments,
  compact = false,
}: AttachmentGalleryProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, startTransition] = useTransition();
  const [selectedType, setSelectedType] =
    useState<AttachmentType>("before");
  const [memo, setMemo] = useState("");
  const [lightbox, setLightbox] = useState<CustomerAttachment | null>(
    null
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = ""; // allow re-upload of same file

    startTransition(async () => {
      let ok = 0;
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("brand_id", String(brandId));
        fd.set("shop_id", String(shopId));
        fd.set("customer_id", String(customerId));
        if (appointmentId != null) {
          fd.set("appointment_id", String(appointmentId));
        }
        fd.set("attachment_type", selectedType);
        fd.set("memo", memo);
        try {
          const res = await uploadCustomerAttachment(fd);
          if ("error" in res && res.error) {
            console.error("[AttachmentGallery] upload error", {
              file: f.name,
              size: f.size,
              error: res.error,
            });
            // エラーメッセージは読み切れるよう長めに表示 (10 秒)。
            toast.error(`${f.name}: ${res.error}`, { duration: 10000 });
          } else {
            ok++;
          }
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "不明なエラー";
          console.error("[AttachmentGallery] upload exception", e);
          // 典型的にはここに「Body exceeded 1MB」等の Next.js 制限が来る
          toast.error(
            `${f.name}: 送信に失敗しました (${msg}). ファイルが大きすぎる場合は 10MB 以下に圧縮してください。`,
            { duration: 10000 }
          );
        }
      }
      if (ok > 0) {
        toast.success(`${ok} 件アップロードしました`);
        setMemo("");
        router.refresh();
      }
    });
  }

  async function handleDelete(attachment: CustomerAttachment) {
    if (!confirm(`「${attachment.fileName}」を削除しますか?`)) return;
    startTransition(async () => {
      const res = await deleteCustomerAttachment(attachment.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("削除しました");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
            <ImagePlus className="h-4 w-4" />
            写真・ファイルを追加
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedType}
              onValueChange={(v) => {
                if (v) setSelectedType(v as AttachmentType);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["before", "after", "memo", "other"] as AttachmentType[]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ATTACHMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <ImagePlus className="mr-1 h-4 w-4" />
              ファイル選択
            </Button>

            {/* モバイル: カメラから直接撮影 (capture属性) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="mr-1 h-4 w-4" />
              カメラで撮影
            </Button>
          </div>

          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ (任意)"
            rows={2}
            className="text-xs"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          <p className="text-[10px] text-gray-500">
            画像 (JPEG / PNG / HEIC) または PDF、1 ファイル最大 10MB。
            携帯からは「カメラで撮影」を押すと直接撮影できます。
          </p>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">
          添付はまだありません
        </p>
      ) : (
        <div
          className={
            compact
              ? "flex flex-wrap gap-1.5"
              : "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
          }
        >
          {attachments.map((a) => (
            <Thumbnail
              key={a.id}
              attachment={a}
              compact={compact}
              onOpen={() => setLightbox(a)}
              onDelete={() => handleDelete(a)}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox
          attachment={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

function Thumbnail({
  attachment,
  compact,
  onOpen,
  onDelete,
}: {
  attachment: CustomerAttachment;
  compact: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const size = compact ? "h-14 w-14" : "h-32 w-full";

  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onOpen}
        className={`block ${size} overflow-hidden`}
      >
        {isImage && attachment.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gray-50 text-gray-400">
            <FileText className="h-8 w-8" />
            <span className="mt-1 max-w-full truncate px-2 text-[10px]">
              {attachment.fileName}
            </span>
          </div>
        )}
      </button>

      {!compact && (
        <>
          <div className="flex items-center justify-between gap-1 px-2 py-1">
            <Badge
              className={`${ATTACHMENT_TYPE_COLORS[attachment.attachmentType]} text-[9px]`}
            >
              {ATTACHMENT_TYPE_LABELS[attachment.attachmentType]}
            </Badge>
            <span
              className="text-[10px] text-gray-400"
              title={`アップロード日時: ${formatJstDateTime(attachment.createdAt)}`}
            >
              {formatJstDate(attachment.createdAt)}
            </span>
          </div>
          {attachment.memo && (
            <p className="line-clamp-2 px-2 pb-2 text-[10px] text-gray-600">
              {attachment.memo}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        aria-label="削除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-red-500 opacity-0 shadow transition-opacity hover:bg-white group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightbox (拡大モーダル)
// ---------------------------------------------------------------------------

function Lightbox({
  attachment,
  onClose,
}: {
  attachment: CustomerAttachment;
  onClose: () => void;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>

        {isImage && attachment.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className="max-h-[85vh] rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-64 w-[28rem] flex-col items-center justify-center rounded-lg bg-white p-6 text-gray-600">
            <FileText className="mb-2 h-12 w-12" />
            <p className="text-sm font-bold">{attachment.fileName}</p>
            {attachment.url && (
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                <Download className="h-3 w-3" />
                ダウンロード
              </a>
            )}
          </div>
        )}

        <div className="mt-3 rounded-lg bg-white/95 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Badge
              className={`${ATTACHMENT_TYPE_COLORS[attachment.attachmentType]} text-[10px]`}
            >
              {ATTACHMENT_TYPE_LABELS[attachment.attachmentType]}
            </Badge>
            <span className="text-gray-500">
              アップロード: {formatJstDateTime(attachment.createdAt)}
            </span>
            {attachment.uploadedByStaffName && (
              <span className="text-gray-500">
                by {attachment.uploadedByStaffName}
              </span>
            )}
          </div>
          {attachment.memo && (
            <p className="mt-2 whitespace-pre-wrap text-gray-700">
              {attachment.memo}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date helpers (JST)
// ---------------------------------------------------------------------------

function formatJstDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  const j = toJst(d);
  return `${j.y}/${j.mo}/${j.da}`;
}

function formatJstDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const j = toJst(d);
  return `${j.y}/${j.mo}/${j.da} ${j.hh}:${j.mm}`;
}

function toJst(d: Date) {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: jst.getUTCFullYear(),
    mo: String(jst.getUTCMonth() + 1).padStart(2, "0"),
    da: String(jst.getUTCDate()).padStart(2, "0"),
    hh: String(jst.getUTCHours()).padStart(2, "0"),
    mm: String(jst.getUTCMinutes()).padStart(2, "0"),
  };
}
