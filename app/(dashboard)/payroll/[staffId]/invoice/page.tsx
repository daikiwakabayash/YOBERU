import { notFound } from "next/navigation";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { getStaffInvoiceData } from "@/feature/payroll/services/getStaffInvoiceData";
import { InvoiceDocument } from "@/feature/payroll/components/InvoiceDocument";
import { InvoicePrintTrigger } from "@/feature/payroll/components/InvoicePrintTrigger";
import { toLocalDateString } from "@/helper/utils/time";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ ym?: string; print?: string }>;
}

function defaultYearMonth(): string {
  return toLocalDateString(new Date()).slice(0, 7);
}

/**
 * 請求書印刷専用ページ。/payroll/[staffId]/invoice?ym=YYYY-MM&print=1
 *
 * URL に print=1 を付けるとマウント時に自動で window.print() を実行する
 * (ユーザーが「ブラウザの印刷 → PDF として保存」をワンクリックで進める)。
 *
 * Sidebar / DashboardHeader 等は dashboard layout で囲まれてしまうので
 * 印刷時は display:none させる print スタイルを各層で意識する必要がある。
 * このページ自体は print:hidden 系を持たない素の InvoiceDocument を出す。
 */
export default async function InvoicePrintPage({
  params,
  searchParams,
}: Props) {
  const { staffId: staffIdStr } = await params;
  const { ym, print } = await searchParams;
  const staffId = Number(staffIdStr);
  if (!Number.isFinite(staffId)) notFound();
  const yearMonth = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : defaultYearMonth();

  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();
  const data = await getStaffInvoiceData({
    staffId,
    shopId,
    brandId,
    yearMonth,
  });
  if (!data) notFound();

  const backHref = `/payroll/${staffId}?ym=${yearMonth}`;

  return (
    <div className="bg-gray-100 print:bg-white">
      <InvoicePrintTrigger backHref={backHref} autoPrint={print === "1"} />
      <div className="py-6 print:py-0">
        <InvoiceDocument data={data} />
      </div>
    </div>
  );
}
