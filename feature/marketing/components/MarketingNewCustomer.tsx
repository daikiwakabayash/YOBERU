import { Card } from "@/components/ui/card";
import { UserPlus, TrendingUp, Users } from "lucide-react";
import type {
  NewCustomerAnalytics,
  NewCustomerRow,
  NewCustomerStaffBucket,
  NewCustomerVisit,
} from "../services/getNewCustomerAnalytics";
import { yen, pct, num } from "./format";

interface MarketingNewCustomerProps {
  data: NewCustomerAnalytics;
}

const VISIT_COLUMNS = [1, 2, 3, 4, 5] as const;

/**
 * 新規管理タブ UI。
 *
 * 上段 = 当月の新規客 1 人 1 行の台帳 (カルテ / 氏名 / 担当 / 媒体 /
 *       会員 / 継・離 / 1〜5 回目の日付と金額)。
 * 中段 = 担当者ごとの集計 (新規数 / 購入数 / 購入率 / 会員単価 /
 *       会員金額 / 1-3 回目売上 / 新規売上合計)。
 * 下段 = 新規売上 / 既存売上 / 合計の比較カード。
 */
export function MarketingNewCustomer({ data }: MarketingNewCustomerProps) {
  const { rows, byStaff, sales, yearMonth } = data;
  const [y, m] = yearMonth.split("-");
  const periodLabel = `${y}年${Number(m)}月`;
  const newShare =
    sales.totalSales > 0 ? sales.newSales / sales.totalSales : 0;

  return (
    <div className="space-y-4">
      {/* Hero 小カード: 新規 / 入会 / 離反率 / 新規売上 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroKpi
          tone="bg-orange-50 border-orange-100"
          icon={<UserPlus className="h-4 w-4 text-orange-500" />}
          label="当月新規"
          value={`${num(byStaff[0]?.newCount ?? 0)}名`}
          sub={periodLabel}
        />
        <HeroKpi
          tone="bg-blue-50 border-blue-100"
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label="入会数"
          value={`${num(byStaff[0]?.joinCount ?? 0)}名`}
          sub={`入会率 ${pct(byStaff[0]?.joinRate ?? 0)}`}
        />
        <HeroKpi
          tone="bg-red-50 border-red-100"
          icon={<TrendingUp className="h-4 w-4 text-red-500" />}
          label="離反"
          value={`${num(rows.filter((r) => r.isChurned).length)}名`}
          sub={`初回のみ / 次回予約なし`}
        />
        <HeroKpi
          tone="bg-emerald-50 border-emerald-100"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="新規売上合計"
          value={yen(byStaff[0]?.newCustomerSalesTotal ?? 0)}
          sub={`1〜3回目の合計`}
        />
      </div>

      {/* スタッフ別サマリー pivot (全体スコアを先に見せる) */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-r from-blue-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <Users className="mr-1.5 inline h-4 w-4 text-blue-500" />
          {periodLabel} のセラピスト別サマリー
        </div>
        <div className="overflow-x-auto">
          <StaffPivotTable byStaff={byStaff} />
        </div>
      </Card>

      {/* 顧客別テーブル (新規客台帳) */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-r from-orange-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <UserPlus className="mr-1.5 inline h-4 w-4 text-orange-500" />
          {periodLabel} の新規客台帳
          <span className="ml-2 text-xs font-normal text-gray-500">
            全 {num(rows.length)} 名
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium">
                  カルテ
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  氏名
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  担当
                </th>
                <th className="px-3 py-2 text-left font-medium">媒体</th>
                <th className="px-3 py-2 text-left font-medium">会員</th>
                <th className="px-3 py-2 text-center font-medium">継・離</th>
                {VISIT_COLUMNS.map((n) => (
                  <th
                    key={n}
                    colSpan={2}
                    className="border-l px-3 py-2 text-center font-medium"
                  >
                    {n}回目
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + VISIT_COLUMNS.length * 2}
                    className="py-6 text-center text-muted-foreground"
                  >
                    当月の新規客はいません
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <CustomerRow key={row.customerId} row={row} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* セクション C: 新規売上 vs 既存売上 */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-r from-emerald-50 to-white px-5 py-3 text-sm font-bold text-gray-800">
          <TrendingUp className="mr-1.5 inline h-4 w-4 text-emerald-500" />
          売上内訳 ({periodLabel})
        </div>
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
          <SalesSplitCell
            label="新規売上"
            sub="当月に初回来店した顧客"
            value={yen(sales.newSales)}
            tone="bg-orange-50"
          />
          <SalesSplitCell
            label="既存売上"
            sub="リピーターによる売上"
            value={yen(sales.existingSales)}
            tone="bg-gray-50"
          />
          <SalesSplitCell
            label="合計売上"
            sub={`新規構成比 ${pct(newShare)}`}
            value={yen(sales.totalSales)}
            tone="bg-emerald-50"
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// sub-components
// ---------------------------------------------------------------------------

function CustomerRow({ row }: { row: NewCustomerRow }) {
  // 1〜5 回目を visits 配列からパディング
  const cells: (NewCustomerVisit | null)[] = Array.from(
    { length: VISIT_COLUMNS.length },
    (_, i) => row.visits[i] ?? null
  );
  return (
    <tr className="hover:bg-gray-50/60">
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-mono text-[11px] text-gray-700">
        {row.code ?? "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-gray-900">
        {row.name}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-gray-700">
        {row.staffName ?? "-"}
      </td>
      <td className="px-3 py-1.5 text-gray-700">
        {row.visitSourceName ?? "-"}
      </td>
      <td className="px-3 py-1.5 text-gray-900">
        {row.planName ? (
          <span className="inline-flex items-center rounded bg-cyan-100 px-1.5 py-0.5 text-[11px] font-bold text-cyan-800">
            {row.planName}
          </span>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-center">
        {row.isChurned ? (
          <span className="inline-flex items-center rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            離反
          </span>
        ) : (
          <span className="text-[10px] text-emerald-600">継続</span>
        )}
      </td>
      {cells.map((v, i) => (
        <VisitCells key={i} visit={v} />
      ))}
    </tr>
  );
}

function VisitCells({ visit }: { visit: NewCustomerVisit | null }) {
  if (!visit) {
    return (
      <>
        <td className="border-l bg-gray-50 px-2 py-1.5 text-center text-[10px] text-gray-300">
          -
        </td>
        <td className="bg-gray-50 px-2 py-1.5 text-center text-[10px] text-gray-300">
          -
        </td>
      </>
    );
  }
  const zero = (visit.sales ?? 0) === 0;
  const join = visit.isMemberJoin;
  const amountClass = join
    ? "bg-cyan-100 text-cyan-800 font-bold"
    : zero
      ? "bg-red-50 text-red-500"
      : "text-gray-800";
  return (
    <>
      <td className="border-l px-2 py-1.5 text-center text-[11px] text-gray-600">
        {formatVisitDate(visit.date)}
      </td>
      <td className={`px-2 py-1.5 text-right text-[11px] ${amountClass}`}>
        {(visit.sales ?? 0).toLocaleString()}
      </td>
    </>
  );
}

function formatVisitDate(iso: string): string {
  // 'YYYY-MM-DD' → 'MM/DD'
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function StaffPivotTable({
  byStaff,
}: {
  byStaff: NewCustomerStaffBucket[];
}) {
  if (byStaff.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-sm text-muted-foreground">
        当月の新規客はいません
      </div>
    );
  }
  return (
    <table className="min-w-full text-xs">
      <thead className="bg-gray-50 text-gray-500">
        <tr>
          <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium">
            指標
          </th>
          {byStaff.map((s, i) => (
            <th
              key={`${s.staffId ?? "total"}-${i}`}
              className={`px-3 py-2 text-right font-medium ${
                s.staffId === null ? "bg-amber-50 text-amber-800" : ""
              }`}
            >
              {s.staffName}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        <PivotRow
          label="新規数"
          values={byStaff.map((s) => num(s.newCount))}
        />
        <PivotRow
          label="購入数"
          values={byStaff.map((s) => num(s.joinCount))}
        />
        <PivotRow
          label="購入率"
          values={byStaff.map((s) =>
            s.newCount > 0 ? pct(s.joinRate) : "-"
          )}
          tone="text-blue-600"
        />
        <PivotRow
          label="会員単価"
          values={byStaff.map((s) =>
            s.joinCount > 0 ? yen(s.memberUnitPrice) : "-"
          )}
        />
        <PivotRow
          label="会員金額"
          values={byStaff.map((s) =>
            s.joinCount > 0 ? yen(s.memberTotal) : "-"
          )}
        />
        <PivotRow
          label="1回目売上"
          values={byStaff.map((s) => yen(s.salesByVisitIndex[0] ?? 0))}
        />
        <PivotRow
          label="2回目売上"
          values={byStaff.map((s) => yen(s.salesByVisitIndex[1] ?? 0))}
        />
        <PivotRow
          label="3回目売上"
          values={byStaff.map((s) => yen(s.salesByVisitIndex[2] ?? 0))}
        />
        <PivotRow
          label="新規売上合計"
          values={byStaff.map((s) => yen(s.newCustomerSalesTotal))}
          tone="font-bold text-emerald-700"
          rowTone="bg-orange-50/40"
        />
      </tbody>
    </table>
  );
}

function PivotRow({
  label,
  values,
  tone,
  rowTone,
}: {
  label: string;
  values: string[];
  tone?: string;
  rowTone?: string;
}) {
  return (
    <tr className={rowTone ?? "hover:bg-gray-50/60"}>
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-700">
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-3 py-1.5 text-right text-gray-800 ${
            i === 0 ? "bg-amber-50/60 font-semibold text-amber-900" : ""
          } ${tone ?? ""}`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

function HeroKpi({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-black text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}

function SalesSplitCell({
  label,
  sub,
  value,
  tone,
}: {
  label: string;
  sub: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`border-r px-5 py-4 last:border-r-0 ${tone}`}>
      <div className="text-xs font-medium text-gray-600">{label}</div>
      <div className="mt-1 text-xl font-black text-gray-900">{value}</div>
      <div className="mt-0.5 text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}
