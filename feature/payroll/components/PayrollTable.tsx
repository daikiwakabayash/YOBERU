"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { StaffMonthlyCompensation } from "../services/getStaffMonthlyCompensation";

interface Props {
  rows: StaffMonthlyCompensation[];
  yearMonth: string; // 'YYYY-MM'
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

export function PayrollTable({ rows, yearMonth }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function changeMonth(v: string) {
    if (!/^\d{4}-\d{2}$/.test(v)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("ym", v);
    router.replace(`${pathname}?${params.toString()}`);
  }

  // 並べる順: 業務委託先 (=計算対象) を先頭、正社員を末尾
  const sorted = [...rows].sort((a, b) => {
    if (a.employmentType !== b.employmentType) {
      return a.employmentType === "contractor" ? -1 : 1;
    }
    return b.compensationInclTax - a.compensationInclTax;
  });

  // totals (業務委託のみ)
  const contractorRows = sorted.filter((r) => r.employmentType === "contractor");
  const totalSales = contractorRows.reduce((s, r) => s + r.salesInclTax, 0);
  const totalComp = contractorRows.reduce((s, r) => s + r.compensationInclTax, 0);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="payroll-month" className="text-sm font-medium">
              対象月
            </label>
            <Input
              id="payroll-month"
              type="month"
              defaultValue={yearMonth}
              onChange={(e) => changeMonth(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="ml-auto flex flex-wrap gap-3 text-sm">
            <span className="rounded bg-gray-100 px-3 py-1.5">
              業務委託 売上合計 (税込):{" "}
              <span className="font-bold">{yen(totalSales)}</span>
            </span>
            <span className="rounded bg-blue-100 px-3 py-1.5">
              業務委託費合計 (税込):{" "}
              <span className="font-bold">{yen(totalComp)}</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-600">
                <th className="px-3 py-2 text-left">スタッフ</th>
                <th className="px-3 py-2 text-left">雇用形態</th>
                <th className="px-3 py-2 text-right">売上(税込)</th>
                <th className="px-3 py-2 text-right">売上(税抜)</th>
                <th className="px-3 py-2 text-right">適用 %</th>
                <th className="px-3 py-2 text-right">最低保証</th>
                <th className="px-3 py-2 text-right">業務委託費(税込)</th>
                <th className="px-3 py-2 text-right">業務委託費(税抜)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    対象月のスタッフが見つかりません
                  </td>
                </tr>
              )}
              {sorted.map((r) => {
                const isRegular = r.employmentType === "regular";
                return (
                  <tr key={r.staffId} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{r.staffName}</td>
                    <td className="px-3 py-2">
                      {isRegular ? (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          正社員
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          業務委託
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {yen(r.salesInclTax)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {yen(r.salesExclTax)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isRegular
                        ? "—"
                        : r.appliedPercentage != null
                          ? `${r.appliedPercentage}%`
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {isRegular ? "—" : yen(r.monthlyMinSalary)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {isRegular ? "—" : yen(r.compensationInclTax)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isRegular ? (
                        <span className="text-xs text-gray-400">
                          給与計算未対応 (Phase 6)
                        </span>
                      ) : (
                        yen(r.compensationExclTax)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900">
          <p className="font-semibold">📋 Phase 1 の集計内容</p>
          <ul className="ml-4 mt-1 list-disc space-y-0.5">
            <li>
              売上 = 該当月の <code>appointments.sales</code> (status=完了 のみ) を staff_id で合計
            </li>
            <li>
              業務委託費 = max(最低保証額, 売上(税抜) × 適用 %) を税込で算出
            </li>
            <li>
              諸手当 (健康・勉強・イベント・住宅・子供・誕生日 等) は Phase 2 で追加
            </li>
            <li>
              請求書 PDF + メール送信は Phase 4 で追加
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
