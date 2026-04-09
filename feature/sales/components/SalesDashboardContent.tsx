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
} from "lucide-react";

interface SalesData {
  totalSales: number;
  totalCount: number;
  newCustomerSales: number;
  newCustomerCount: number;
  existingCustomerSales: number;
  existingCustomerCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  staffSales: Array<{
    staffId: number;
    staffName: string;
    sales: number;
    count: number;
  }>;
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
      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総売上
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{data.totalSales.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.totalCount}件完了
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              新規顧客
            </CardTitle>
            <UserPlus className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{data.newCustomerSales.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.newCustomerCount}件
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              既存顧客
            </CardTitle>
            <UserCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{data.existingCustomerSales.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.existingCustomerCount}件
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              キャンセル/無断
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-400" />
                  <span className="text-lg font-bold">
                    {data.cancelledCount}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">キャンセル</p>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-orange-400" />
                  <span className="text-lg font-bold">{data.noShowCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">無断</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Sales Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>スタッフ別売上</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>スタッフ</TableHead>
                <TableHead className="text-right">売上</TableHead>
                <TableHead className="text-right">件数</TableHead>
                <TableHead className="text-right">客単価</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.staffSales.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                data.staffSales.map((staff) => (
                  <TableRow key={staff.staffId}>
                    <TableCell className="font-medium">
                      {staff.staffName}
                    </TableCell>
                    <TableCell className="text-right">
                      ¥{staff.sales.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{staff.count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ¥
                      {staff.count > 0
                        ? Math.round(staff.sales / staff.count).toLocaleString()
                        : 0}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
