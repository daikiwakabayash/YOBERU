"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText, Mail, ExternalLink } from "lucide-react";
import { sendPayrollInvoiceEmail } from "../actions/invoiceActions";

/**
 * 給与内訳ページ上部に貼る「請求書を表示」「メールで送信」ボタン群。
 *
 * - 表示: /payroll/[staffId]/invoice?ym=... を新規タブで開く (?print=1
 *   付きで自動印刷ダイアログを起動)。ユーザーは「PDF として保存」を選ぶ。
 * - メール: server action で staff の users.email に HTML 本文として送信。
 *   宛先メールが未登録のときはエラー toast。
 */
export function InvoiceActionsBar({
  staffId,
  yearMonth,
  staffEmail,
}: {
  staffId: number;
  yearMonth: string;
  staffEmail: string | null;
}) {
  const [pending, start] = useTransition();
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  function handleSendEmail() {
    if (!staffEmail) {
      toast.error(
        "スタッフのメールアドレスが登録されていません (users.email)。スタッフ管理画面から確認してください。"
      );
      return;
    }
    if (!confirm(`${staffEmail} に請求書を送信します。よろしいですか？`)) return;
    start(async () => {
      const res = await sendPayrollInvoiceEmail({ staffId, yearMonth });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`請求書を送信しました (${res.sentTo})`);
      setLastSentAt(new Date().toLocaleTimeString("ja-JP"));
    });
  }

  const previewHref = `/payroll/${staffId}/invoice?ym=${yearMonth}`;
  const printHref = `${previewHref}&print=1`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={previewHref} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm">
          <FileText className="mr-1 h-4 w-4" />
          請求書を表示
          <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
        </Button>
      </Link>
      <Link href={printHref} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm">
          <FileText className="mr-1 h-4 w-4" />
          PDF として保存
          <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
        </Button>
      </Link>
      <Button
        size="sm"
        onClick={handleSendEmail}
        disabled={pending || !staffEmail}
        title={
          staffEmail
            ? `送信先: ${staffEmail}`
            : "スタッフのメールアドレスが未登録"
        }
      >
        <Mail className="mr-1 h-4 w-4" />
        {pending ? "送信中..." : "メールで送信"}
      </Button>
      {lastSentAt && (
        <span className="text-xs text-gray-500">
          送信済み ({lastSentAt})
        </span>
      )}
    </div>
  );
}
