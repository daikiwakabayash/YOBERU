"use server";

import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { sendEmail } from "@/helper/lib/email/sendEmail";
import { getStaffInvoiceData } from "../services/getStaffInvoiceData";
import { renderInvoiceHtml } from "../components/InvoiceDocument";

/**
 * スタッフに当月分の請求書をメール送信する。
 *
 * 動作:
 *   1. /payroll/[staffId] と同じ集計サービスで請求書データを再取得
 *   2. staffs → users.email を引いて宛先確定
 *   3. renderInvoiceHtml で HTML 本文を組み立て、Resend に投げる
 *      (添付 PDF ではなく HTML 本文に直接埋め込む形)
 *
 * 失敗ケース:
 *   - スタッフが見つからない
 *   - users.email が空 (まだログインユーザー連携できていないケース)
 *   - Resend API キー未設定 / 送信失敗
 */
export async function sendPayrollInvoiceEmail(params: {
  staffId: number;
  yearMonth: string;
}): Promise<{ success?: true; error?: string; sentTo?: string }> {
  const { staffId, yearMonth } = params;
  if (!Number.isFinite(staffId)) {
    return { error: "staffId が不正です" };
  }
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return { error: "年月の形式が不正です (YYYY-MM)" };
  }

  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();
  const data = await getStaffInvoiceData({
    staffId,
    shopId,
    brandId,
    yearMonth,
  });
  if (!data) {
    return { error: "スタッフ / 給与データが見つかりません" };
  }
  if (!data.staffEmail) {
    return {
      error:
        "スタッフのメールアドレスが登録されていません (users.email が空)",
    };
  }

  const html = renderInvoiceHtml(data);

  // Plain text フォールバック (HTML 非対応クライアント向け簡易表示)
  const plainLines: string[] = [
    `${data.yearMonth} 月 業務委託費 請求書`,
    "",
    `${data.staffName} 様`,
    "",
    `請求金額 (税込): ¥${data.totalInclTax.toLocaleString()}`,
    "",
    "明細:",
    ...data.lines.map(
      (l) => `  ${l.label}: ¥${l.amount.toLocaleString()}${l.note ? ` (${l.note})` : ""}`
    ),
    "",
    `発行日: ${data.issueDate}`,
    `発行元: ${data.shopName}`,
    "",
    "※ 詳細は HTML 表示をご確認ください。",
  ];

  const result = await sendEmail({
    to: data.staffEmail,
    subject: `${data.yearMonth} 月分 業務委託費 請求書 (${data.shopName})`,
    body: plainLines.join("\n"),
    htmlBody: html,
    fromName: data.shopName,
  });

  if (!result.success) {
    return { error: result.error ?? "メール送信に失敗しました" };
  }

  return { success: true, sentTo: data.staffEmail };
}
