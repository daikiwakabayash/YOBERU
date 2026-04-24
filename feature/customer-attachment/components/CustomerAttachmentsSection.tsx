"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AttachmentGallery } from "./AttachmentGallery";
import type { CustomerAttachment } from "../types";

interface Props {
  brandId: number;
  shopId: number;
  customerId: number;
  appointmentId?: number | null;
  compact?: boolean;
}

/**
 * カルテ添付ファイル表示+アップロードの自己完結クライアントコンポーネント。
 *
 * サーバーアクションで upload / delete / update すると revalidatePath が走るが、
 * クライアント遷移では再マウントされないので router.refresh() の後に
 * useEffect 依存を発火させて再取得する。
 */
export function CustomerAttachmentsSection({
  brandId,
  shopId,
  customerId,
  appointmentId,
  compact,
}: Props) {
  const router = useRouter();
  void router;
  const [attachments, setAttachments] = useState<CustomerAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    import("../services/getAttachments")
      .then((m) =>
        m.getCustomerAttachments({
          customerId,
          appointmentId: appointmentId ?? null,
        })
      )
      .then((data) => {
        if (!cancelled) setAttachments(data);
      })
      .catch(() => {
        if (!cancelled) setAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, appointmentId, refreshNonce]);

  // ポーリング風リフレッシュ: AttachmentGallery が router.refresh() を呼んだ
  // 後、ウィンドウがフォーカスし直された際にも最新を取り直す。
  useEffect(() => {
    function onFocus() {
      setRefreshNonce((n) => n + 1);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (loading && attachments.length === 0) {
    return (
      <p className="text-xs text-gray-400">読み込み中...</p>
    );
  }

  return (
    <AttachmentGallery
      brandId={brandId}
      shopId={shopId}
      customerId={customerId}
      appointmentId={appointmentId ?? null}
      attachments={attachments}
      compact={compact}
      onChanged={() => setRefreshNonce((n) => n + 1)}
    />
  );
}
