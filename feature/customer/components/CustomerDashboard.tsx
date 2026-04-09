"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Activity,
  Clock,
  UserX,
  BarChart3,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CustomerRow {
  id: number;
  last_name: string | null;
  first_name: string | null;
  phone_number_1: string | null;
  shop_id: number;
  visit_count: number | null;
  total_sales: number | null;
  last_visit_date: string | null;
  first_visit_source_id: number | null;
  visit_sources: { id: number; name: string } | null;
  default_menu_manage_id: string | null;
  created_at: string;
}

interface Summary {
  total: number;
  active: number;
  inactive: number;
  churned: number;
}

interface CustomerDashboardProps {
  customers: CustomerRow[];
  totalCount: number;
  summary: Summary;
  visitSources: Array<{ id: number; name: string }>;
  shopId: number;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function deriveStatus(c: CustomerRow): {
  label: string;
  cls: string;
} {
  if (!c.visit_count || c.visit_count === 0) {
    return { label: "新規", cls: "border-blue-300 bg-blue-50 text-blue-700" };
  }
  if (!c.last_visit_date) {
    return { label: "未来店", cls: "border-yellow-300 bg-yellow-50 text-yellow-700" };
  }
  const lastVisit = new Date(c.last_visit_date);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 90) {
    return { label: "通院中", cls: "border-green-300 bg-green-50 text-green-700" };
  }
  if (diffDays <= 180) {
    return { label: "未来店", cls: "border-yellow-300 bg-yellow-50 text-yellow-700" };
  }
  return { label: "離反", cls: "border-red-300 bg-red-50 text-red-700" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CustomerDashboard({
  customers,
  totalCount,
  summary,
  visitSources,
  shopId,
}: CustomerDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [aggregating, setAggregating] = useState(false);

  // ---- Filter handlers ----
  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/customer?${params.toString()}`);
  }

  const activeStatus = searchParams.get("status") ?? "";
  const activeSource = searchParams.get("source") ?? "";

  // ---- Aggregation handler ----
  async function handleAggregate() {
    const today = new Date();
    const monthDay = `${today.getMonth() + 1}月${today.getDate()}日`;
    if (!confirm(`${monthDay}の集計実行を実施してよろしいですか？`)) return;

    setAggregating(true);
    try {
      const { runAggregation } = await import(
        "@/feature/customer/actions/customerActions"
      );
      const result = await runAggregation(shopId);
      if ("error" in result && result.error) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "集計に失敗しました"
        );
      } else {
        toast.success("集計が完了しました");
        router.refresh();
      }
    } catch {
      toast.error("集計中にエラーが発生しました");
    } finally {
      setAggregating(false);
    }
  }

  // ---- Pagination ----
  const currentPage = Number(searchParams.get("page") ?? "1");
  const perPage = 20;
  const totalPages = Math.ceil(totalCount / perPage);

  function goPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/customer?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* ===== Summary Cards ===== */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<Users className="h-5 w-5 text-gray-500" />}
          label="総患者数"
          value={summary.total}
        />
        <SummaryCard
          icon={<Activity className="h-5 w-5 text-green-500" />}
          label="通院中"
          value={summary.active}
          accent="text-green-600"
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          label="未来店"
          value={summary.inactive}
          accent="text-yellow-600"
        />
        <SummaryCard
          icon={<UserX className="h-5 w-5 text-red-500" />}
          label="離反"
          value={summary.churned}
          accent="text-red-600"
        />
      </div>

      {/* ===== Filter Row ===== */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">ステータス</label>
          <select
            value={activeStatus}
            onChange={(e) => setFilter("status", e.target.value || null)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm"
          >
            <option value="">すべて</option>
            <option value="active">通院中</option>
            <option value="inactive">未来店</option>
            <option value="new">新規</option>
            <option value="churned">離反</option>
          </select>
        </div>

        {/* Visit source filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">経路</label>
          <select
            value={activeSource}
            onChange={(e) => setFilter("source", e.target.value || null)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm"
          >
            <option value="">すべて</option>
            {visitSources.map((vs) => (
              <option key={vs.id} value={String(vs.id)}>
                {vs.name}
              </option>
            ))}
          </select>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Aggregate button */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleAggregate}
          disabled={aggregating}
          className="gap-1.5"
        >
          <BarChart3 className="h-4 w-4" />
          {aggregating ? "集計中..." : "集計実行"}
        </Button>
      </div>

      {/* ===== Results count ===== */}
      <p className="text-sm text-muted-foreground">
        全 {totalCount} 件
      </p>

      {/* ===== Table ===== */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>店舗</TableHead>
            <TableHead>プラン</TableHead>
            <TableHead className="text-center">来院</TableHead>
            <TableHead className="text-right">累計金額</TableHead>
            <TableHead>最終</TableHead>
            <TableHead>経路</TableHead>
            <TableHead className="text-center">状態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={9}
                className="py-8 text-center text-muted-foreground"
              >
                顧客が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            customers.map((customer) => {
              const fullName =
                [customer.last_name, customer.first_name]
                  .filter(Boolean)
                  .join(" ") || "-";
              const status = deriveStatus(customer);

              return (
                <TableRow key={customer.id}>
                  {/* Name + phone */}
                  <TableCell>
                    <div>
                      <span className="font-medium">{fullName}</span>
                      {customer.phone_number_1 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {customer.phone_number_1}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {/* Shop */}
                  <TableCell className="text-sm text-gray-600">
                    {customer.shop_id}
                  </TableCell>
                  {/* Plan */}
                  <TableCell className="text-sm text-gray-600">
                    {customer.default_menu_manage_id ?? "-"}
                  </TableCell>
                  {/* Visit count */}
                  <TableCell className="text-center font-medium">
                    {customer.visit_count ?? 0}
                  </TableCell>
                  {/* Total sales */}
                  <TableCell className="text-right text-sm font-medium">
                    {customer.total_sales
                      ? `¥${customer.total_sales.toLocaleString()}`
                      : "¥0"}
                  </TableCell>
                  {/* Last visit date */}
                  <TableCell className="text-sm text-gray-600">
                    {customer.last_visit_date ?? "-"}
                  </TableCell>
                  {/* Visit source */}
                  <TableCell className="text-sm text-gray-600">
                    {customer.visit_sources?.name ?? "-"}
                  </TableCell>
                  {/* Status badge */}
                  <TableCell className="text-center">
                    <Badge variant="outline" className={status.cls}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  {/* Actions */}
                  <TableCell className="text-right">
                    <Link href={`/customer/${customer.id}`}>
                      <Button variant="ghost" size="sm" title="詳細">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* ===== Pagination ===== */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => goPage(currentPage - 1)}
          >
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => goPage(currentPage + 1)}
          >
            次へ
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card sub-component
// ---------------------------------------------------------------------------
function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-bold ${accent ?? "text-gray-900"}`}>
            {value.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
