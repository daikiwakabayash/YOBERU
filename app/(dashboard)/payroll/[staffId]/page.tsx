import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/helper/lib/supabase/server";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { getStaffMonthlyPayrollForShop } from "@/feature/payroll/services/getStaffMonthlyPayroll";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AllowanceUsageList, type UsageRow } from "@/feature/payroll/components/AllowanceUsageList";
import { toLocalDateString } from "@/helper/utils/time";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ ym?: string }>;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

function defaultYearMonth(): string {
  return toLocalDateString(new Date()).slice(0, 7);
}

export default async function StaffPayrollDetailPage({
  params,
  searchParams,
}: Props) {
  const { staffId: staffIdStr } = await params;
  const { ym } = await searchParams;
  const staffId = Number(staffIdStr);
  if (!Number.isFinite(staffId)) notFound();
  const yearMonth = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : defaultYearMonth();
  const year = Number(yearMonth.slice(0, 4));

  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // 一覧と同じ集計サービスを再利用 (1 スタッフ分だけ抜き出す)
  const allRows = await getStaffMonthlyPayrollForShop({
    shopId,
    brandId,
    yearMonth,
  });
  const row = allRows.find((r) => r.staffId === staffId);
  if (!row) {
    return (
      <div>
        <PageHeader
          title="スタッフが見つかりません"
          description={`ID: ${staffId}`}
          actions={
            <Link href={`/payroll?ym=${yearMonth}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                給与計算へ戻る
              </Button>
            </Link>
          }
        />
        <div className="p-6">
          <Card>
            <CardContent className="py-6 text-center text-sm text-gray-500">
              この店舗にスタッフ ID {staffId} が見つかりませんでした。
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 当年の使用履歴を 2 種別ぶん取得
  const supabase = await createClient();
  const { data: usageData } = await supabase
    .from("allowance_usage")
    .select("id, allowance_type, year_month, amount, note")
    .eq("staff_id", staffId)
    .eq("year", year)
    .is("deleted_at", null)
    .order("year_month", { ascending: true })
    .order("id", { ascending: true });

  const studyRows: UsageRow[] = [];
  const eventRows: UsageRow[] = [];
  for (const u of usageData ?? []) {
    const r: UsageRow = {
      id: u.id as number,
      yearMonth: u.year_month as string,
      amount: u.amount as number,
      note: (u.note as string | null) ?? null,
    };
    if (u.allowance_type === "study") studyRows.push(r);
    else if (u.allowance_type === "event_access") eventRows.push(r);
  }

  const isRegular = row.employmentType === "regular";

  return (
    <div>
      <PageHeader
        title={`給与内訳: ${row.staffName}`}
        description={`${yearMonth} 月`}
        actions={
          <Link href={`/payroll?ym=${yearMonth}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              一覧へ戻る
            </Button>
          </Link>
        }
      />

      <div className="space-y-6 p-6">
        {/* スタッフ概要 */}
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-gray-500">雇用形態</div>
              <Badge
                variant="outline"
                className={
                  isRegular
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }
              >
                {isRegular ? "正社員" : "業務委託"}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-gray-500">入社日</div>
              <div className="font-medium">{row.hiredAt ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">誕生日</div>
              <div className="font-medium">{row.birthday ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">子供の数</div>
              <div className="font-medium">{row.childrenCount} 人</div>
            </div>
          </CardContent>
        </Card>

        {/* 業務委託費 */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-base font-bold">業務委託費 (基本報酬)</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <KV label="売上(税込)" value={yen(row.salesInclTax)} />
              <KV label="売上(税抜)" value={yen(row.salesExclTax)} />
              <KV
                label="適用 %"
                value={
                  isRegular
                    ? "—"
                    : row.appliedPercentage != null
                      ? `${row.appliedPercentage}%`
                      : "最低保証"
                }
              />
              <KV
                label="月次最低保証"
                value={isRegular ? "—" : yen(row.monthlyMinSalary)}
              />
              <KV
                label="業務委託費(税込)"
                value={
                  isRegular ? (
                    <span className="text-xs text-gray-400">
                      Phase 6 で対応
                    </span>
                  ) : (
                    yen(row.compensationInclTax)
                  )
                }
                bold
              />
              <KV
                label="業務委託費(税抜)"
                value={isRegular ? "—" : yen(row.compensationExclTax)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 諸手当 — 自動付与 */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-base font-bold">諸手当 (自動付与)</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <KV
                label={`子供手当 (${row.childrenCount}人 × 5,000)`}
                value={
                  row.allowances.childrenAmount > 0
                    ? yen(row.allowances.childrenAmount)
                    : "—"
                }
              />
              <KV
                label="誕生日手当"
                value={
                  row.allowances.birthdayAmount > 0
                    ? yen(row.allowances.birthdayAmount)
                    : "誕生月外"
                }
              />
              <KV
                label="健康手当 (売上 ≥ 100万)"
                value={
                  row.allowances.healthAmount > 0
                    ? yen(row.allowances.healthAmount)
                    : "条件未達"
                }
              />
              <KV
                label="住宅手当 (売上 ≥ 100万)"
                value={
                  row.allowances.housingAmount > 0
                    ? yen(row.allowances.housingAmount)
                    : "条件未達"
                }
              />
            </div>
            <div className="text-xs text-gray-500">
              ※ 売上 (税込) {yen(row.salesInclTax)} →{" "}
              {row.allowances.isSalesAboveThreshold
                ? "100 万円以上 (健康・住宅・繰越手当 対象)"
                : "100 万円未達 (健康・住宅・繰越手当 対象外)"}
            </div>
          </CardContent>
        </Card>

        {/* 諸手当 — 繰越あり (勉強 / イベントアクセス) */}
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="text-base font-bold">
                繰越手当 (勉強代 / イベントアクセス)
              </h2>
              <p className="text-xs text-gray-500">
                税込売上 100 万円達成月ごとに 10,000 円を 1 年内累積、12 月末で
                リセット。下のフォームから当月の使用額を記録してください。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded border bg-blue-50/30 p-3">
                <div className="text-xs text-gray-500">勉強代手当</div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <span>
                    付与累計:{" "}
                    <span className="font-bold tabular-nums">
                      {yen(row.allowances.study.accruedYearToDate)}
                    </span>
                  </span>
                  <span>
                    使用累計:{" "}
                    <span className="font-bold tabular-nums">
                      {yen(row.allowances.study.usedYearToDate)}
                    </span>
                  </span>
                  <span>
                    残枠:{" "}
                    <span className="font-bold tabular-nums text-blue-700">
                      {yen(row.allowances.study.balance)}
                    </span>
                  </span>
                </div>
              </div>
              <div className="rounded border bg-blue-50/30 p-3">
                <div className="text-xs text-gray-500">イベントアクセス手当</div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <span>
                    付与累計:{" "}
                    <span className="font-bold tabular-nums">
                      {yen(row.allowances.eventAccess.accruedYearToDate)}
                    </span>
                  </span>
                  <span>
                    使用累計:{" "}
                    <span className="font-bold tabular-nums">
                      {yen(row.allowances.eventAccess.usedYearToDate)}
                    </span>
                  </span>
                  <span>
                    残枠:{" "}
                    <span className="font-bold tabular-nums text-blue-700">
                      {yen(row.allowances.eventAccess.balance)}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <AllowanceUsageList
              staffId={staffId}
              yearMonth={yearMonth}
              allowanceType="study"
              label="勉強代手当の使用記録"
              balance={row.allowances.study.balance}
              rows={studyRows}
            />
            <AllowanceUsageList
              staffId={staffId}
              yearMonth={yearMonth}
              allowanceType="event_access"
              label="イベントアクセス手当の使用記録"
              balance={row.allowances.eventAccess.balance}
              rows={eventRows}
            />
          </CardContent>
        </Card>

        {/* 月の支払総額 */}
        <Card className="border-orange-200 bg-orange-50/30">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-gray-600">{yearMonth} 月 支払総額 (税込)</div>
            <div className="text-3xl font-black text-orange-700">
              {yen(row.totalInclTax)}
            </div>
            <div className="text-[11px] text-gray-500">
              業務委託費 {yen(row.compensationInclTax)} + 諸手当{" "}
              {yen(row.allowances.monthlyTotal)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-1 tabular-nums ${bold ? "text-base font-bold" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}
