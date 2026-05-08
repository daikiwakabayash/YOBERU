"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Users,
  UserPlus,
  UserCheck,
  XCircle,
  AlertTriangle,
  Ticket,
} from "lucide-react";

interface SalesData {
  totalSales: number;
  totalCount: number;
  newCustomerSales: number;
  newCustomerCount: number;
  existingCustomerSales: number;
  existingCustomerCount: number;
  consumedSales: number;
  consumedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  staffSales: Array<{
    staffId: number;
    staffName: string;
    sales: number;
    count: number;
    treatmentCount: number;
    newCount: number;
    consumedSales: number;
    openMin: number;
    busyMin: number;
    utilizationRate: number;
    /** その月にこのスタッフが受けた G口コミ件数 (手入力) */
    googleReviewCount?: number;
    /** その月にこのスタッフが受けた H口コミ件数 (手入力) */
    hotpepperReviewCount?: number;
  }>;
}

function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function utilizationBadgeClass(rate: number): string {
  const pct = Math.round(rate * 100);
  if (pct >= 85) return "bg-red-100 text-red-700";
  if (pct >= 60) return "bg-amber-100 text-amber-700";
  if (pct > 0) return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-400";
}

interface SalesDashboardContentProps {
  data: SalesData;
  dateRange: string;
}

export function SalesDashboardContent({
  data,
  dateRange,
}: SalesDashboardContentProps) {
  return (
    <div className="space-y-6">
      {/* Summary KPI Cards (compact) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card data-size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              総売上
            </CardTitle>
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold leading-tight">
              ¥{data.totalSales.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data.totalCount}件完了
            </p>
          </CardContent>
        </Card>

        {/* 消化売上: 前金で売ったチケット/サブスクが来店で消化された金額。
            会計 (totalSales) とは別軸で、実サービス提供時点の売上認識。 */}
        <Card data-size="sm" className="border-cyan-200 bg-cyan-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-cyan-700">
              消化売上
            </CardTitle>
            <Ticket className="h-3.5 w-3.5 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold leading-tight text-cyan-900">
              ¥{data.consumedSales.toLocaleString()}
            </div>
            <p className="text-[11px] text-cyan-700/80">
              {data.consumedCount}件消化
            </p>
          </CardContent>
        </Card>

        <Card data-size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              新規顧客
            </CardTitle>
            <UserPlus className="h-3.5 w-3.5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold leading-tight">
              ¥{data.newCustomerSales.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data.newCustomerCount}件
            </p>
          </CardContent>
        </Card>

        <Card data-size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              既存顧客
            </CardTitle>
            <UserCheck className="h-3.5 w-3.5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold leading-tight">
              ¥{data.existingCustomerSales.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data.existingCustomerCount}件
            </p>
          </CardContent>
        </Card>

        <Card data-size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              キャンセル/無断
            </CardTitle>
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-400" />
                  <span className="text-base font-bold">
                    {data.cancelledCount}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">キャンセル</p>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-orange-400" />
                  <span className="text-base font-bold">{data.noShowCount}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">無断</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Sales + Utilization Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>スタッフ別売上 / 稼働率</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>スタッフ</TableHead>
                <TableHead className="text-right">売上</TableHead>
                <TableHead className="text-right text-cyan-700">消化売上</TableHead>
                <TableHead className="text-right">件数</TableHead>
                <TableHead className="text-right">客単価</TableHead>
                <TableHead className="text-right">予約開放時間</TableHead>
                <TableHead className="text-right">稼働時間</TableHead>
                <TableHead className="text-right">稼働率</TableHead>
                <TableHead className="text-right">施術数</TableHead>
                <TableHead className="text-right">新規数</TableHead>
                <TableHead className="text-right">G口コミ</TableHead>
                <TableHead className="text-right">H口コミ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.staffSales.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="py-8 text-center text-muted-foreground"
                  >
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                data.staffSales.map((staff) => {
                  const ratePct = Math.round(staff.utilizationRate * 100);
                  return (
                    <TableRow key={staff.staffId}>
                      <TableCell className="font-medium">
                        {staff.staffName}
                      </TableCell>
                      <TableCell className="text-right">
                        ¥{staff.sales.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-cyan-800">
                        {staff.consumedSales > 0
                          ? `¥${staff.consumedSales.toLocaleString()}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{staff.count}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        ¥
                        {staff.count > 0
                          ? Math.round(
                              staff.sales / staff.count
                            ).toLocaleString()
                          : 0}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        {formatHours(staff.openMin)}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        {formatHours(staff.busyMin)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${utilizationBadgeClass(staff.utilizationRate)}`}
                        >
                          {staff.openMin > 0 ? `${ratePct}%` : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {staff.treatmentCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={
                            staff.newCount > 0
                              ? "bg-orange-100 text-orange-700"
                              : ""
                          }
                        >
                          {staff.newCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={
                            (staff.googleReviewCount ?? 0) > 0
                              ? "bg-amber-100 text-amber-700"
                              : ""
                          }
                          title="期間内に G 口コミチェックが付いた顧客の、最終完了予約担当スタッフに帰属"
                        >
                          {staff.googleReviewCount ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={
                            (staff.hotpepperReviewCount ?? 0) > 0
                              ? "bg-amber-100 text-amber-700"
                              : ""
                          }
                          title="期間内に H 口コミチェックが付いた顧客の、最終完了予約担当スタッフに帰属"
                        >
                          {staff.hotpepperReviewCount ?? 0}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
