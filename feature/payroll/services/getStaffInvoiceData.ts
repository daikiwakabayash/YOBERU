"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { getStaffMonthlyPayrollForShop } from "./getStaffMonthlyPayroll";
import type { StaffMonthlyPayrollRow } from "./getStaffMonthlyPayroll";
import {
  ALLOWANCE_BY_CODE,
  CARRYOVER_CODES,
  CLAIM_CODES,
  type AllowanceCode,
} from "../allowanceTypes";

/**
 * 請求書 1 枚分のデータ。/payroll/[staffId]/invoice 印刷ページと
 * sendPayrollInvoiceEmail server action から共通で使う。
 */
export interface InvoiceData {
  // 発行先 (スタッフ)
  staffId: number;
  staffName: string;
  staffEmail: string | null;
  // 発行元 (店舗)
  shopName: string;
  shopAddress: string;
  shopZipCode: string;
  shopPhone: string;
  // 請求情報
  yearMonth: string;
  issueDate: string; // YYYY-MM-DD (今日)
  // 行 (label / amount / note)。0 円の手当はスキップして読みやすくする。
  lines: InvoiceLine[];
  totalInclTax: number;
  // 内訳サマリ (合計再計算用)
  payroll: StaffMonthlyPayrollRow;
}

export interface InvoiceLine {
  label: string;
  amount: number;
  note?: string;
  /** 'compensation' | 'allowance_auto' | 'allowance_carryover' | 'allowance_claim' */
  group:
    | "compensation"
    | "allowance_auto"
    | "allowance_carryover"
    | "allowance_claim";
}

export async function getStaffInvoiceData(params: {
  staffId: number;
  shopId: number;
  brandId: number;
  yearMonth: string;
}): Promise<InvoiceData | null> {
  const supabase = await createClient();
  const { staffId, shopId, brandId, yearMonth } = params;

  // 1. payroll 集計を再利用 (一覧と同じ計算で 1 件だけ抜く)
  const allRows = await getStaffMonthlyPayrollForShop({
    shopId,
    brandId,
    yearMonth,
  });
  const row = allRows.find((r) => r.staffId === staffId);
  if (!row) return null;

  // 2. staffs → users で email を引く + shops 情報
  const [staffRes, shopRes] = await Promise.all([
    supabase
      .from("staffs")
      .select("user_id")
      .eq("id", staffId)
      .maybeSingle(),
    supabase
      .from("shops")
      .select("name, address, zip_code, phone_number")
      .eq("id", shopId)
      .maybeSingle(),
  ]);

  let staffEmail: string | null = null;
  if (staffRes.data?.user_id) {
    const userRes = await supabase
      .from("users")
      .select("email")
      .eq("id", staffRes.data.user_id)
      .maybeSingle();
    staffEmail = (userRes.data?.email as string | null) ?? null;
  }

  // 3. 当月の使用記録 (claim 型と carryover 型) を allowance_code 別に集計
  // 既に payroll 集計に含まれているが、請求書には「明細行」として個別に
  // 出したいので、もう一度引く。
  const { data: usageData } = await supabase
    .from("allowance_usage")
    .select("allowance_type, amount, note")
    .eq("staff_id", staffId)
    .eq("year_month", yearMonth)
    .is("deleted_at", null);

  const claimByCode = new Map<AllowanceCode, { amount: number; notes: string[] }>();
  let studyUsed = 0;
  let eventUsed = 0;
  for (const u of usageData ?? []) {
    const t = u.allowance_type as string;
    const amt = (u.amount as number) ?? 0;
    const note = (u.note as string | null) ?? null;
    if (t === "study") studyUsed += amt;
    else if (t === "event_access") eventUsed += amt;
    else if (CLAIM_CODES.includes(t as AllowanceCode)) {
      const code = t as AllowanceCode;
      const cur = claimByCode.get(code) ?? { amount: 0, notes: [] };
      cur.amount += amt;
      if (note) cur.notes.push(note);
      claimByCode.set(code, cur);
    }
  }

  // 4. 明細行を組み立て
  const lines: InvoiceLine[] = [];

  // 業務委託費 (基本報酬)
  if (row.compensationInclTax > 0) {
    const pctNote =
      row.appliedPercentage != null
        ? `売上(税抜) ¥${row.salesExclTax.toLocaleString()} × ${row.appliedPercentage}%`
        : `最低保証額 ¥${row.monthlyMinSalary.toLocaleString()}`;
    lines.push({
      label: "業務委託費 (基本報酬, 税込)",
      amount: row.compensationInclTax,
      note: pctNote,
      group: "compensation",
    });
  }

  // 自動付与
  if (row.allowances.childrenAmount > 0) {
    lines.push({
      label: "子供手当",
      amount: row.allowances.childrenAmount,
      note: `${row.childrenCount} 人 × 5,000`,
      group: "allowance_auto",
    });
  }
  if (row.allowances.birthdayAmount > 0) {
    lines.push({
      label: "誕生日手当",
      amount: row.allowances.birthdayAmount,
      group: "allowance_auto",
    });
  }
  if (row.allowances.healthAmount > 0) {
    lines.push({
      label: "健康手当",
      amount: row.allowances.healthAmount,
      note: "税込売上 ≥ 100 万",
      group: "allowance_auto",
    });
  }
  if (row.allowances.housingAmount > 0) {
    lines.push({
      label: "住宅手当",
      amount: row.allowances.housingAmount,
      note: "税込売上 ≥ 100 万",
      group: "allowance_auto",
    });
  }

  // 繰越手当の当月使用分
  for (const code of CARRYOVER_CODES) {
    const used = code === "study" ? studyUsed : eventUsed;
    if (used > 0) {
      const meta = ALLOWANCE_BY_CODE[code];
      lines.push({
        label: `${meta.label} (当月使用分)`,
        amount: used,
        group: "allowance_carryover",
      });
    }
  }

  // claim 型の当月使用分
  for (const code of CLAIM_CODES) {
    const c = claimByCode.get(code);
    if (c && c.amount > 0) {
      const meta = ALLOWANCE_BY_CODE[code];
      lines.push({
        label: meta.label,
        amount: c.amount,
        note: c.notes.length > 0 ? c.notes.join(" / ") : undefined,
        group: "allowance_claim",
      });
    }
  }

  // 5. 発行日 = JST の今日
  const todayJst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
  }).format(new Date());

  return {
    staffId,
    staffName: row.staffName,
    staffEmail,
    shopName: (shopRes.data?.name as string) ?? "",
    shopAddress: (shopRes.data?.address as string) ?? "",
    shopZipCode: (shopRes.data?.zip_code as string) ?? "",
    shopPhone: (shopRes.data?.phone_number as string) ?? "",
    yearMonth,
    issueDate: todayJst,
    lines,
    totalInclTax: row.totalInclTax,
    payroll: row,
  };
}
