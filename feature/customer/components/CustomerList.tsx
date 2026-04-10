"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Trash2, Search } from "lucide-react";
import { deleteCustomer } from "../actions/customerActions";
import { toast } from "sonner";
import type { Customer } from "../types";

const TYPE_LABELS: Record<number, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  0: { label: "一般", variant: "secondary" },
  1: { label: "会員", variant: "default" },
  2: { label: "退会", variant: "destructive" },
};

interface CustomerListProps {
  customers: Customer[];
  totalCount: number;
}

export function CustomerList({ customers, totalCount }: CustomerListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const pushSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      params.delete("page");
      router.push(`/customer?${params.toString()}`);
    },
    [router, searchParams]
  );

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => pushSearch(value), 400);
    setDebounceTimer(timer);
  }

  function handleTypeFilter(type: number | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (type !== null) {
      params.set("type", String(type));
    } else {
      params.delete("type");
    }
    params.delete("page");
    router.push(`/customer?${params.toString()}`);
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const result = await deleteCustomer(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("顧客を削除しました");
    }
  }

  const activeType = searchParams.get("type");

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="名前・電話番号・コードで検索..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">種別:</span>
          <Badge
            variant={activeType === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => handleTypeFilter(null)}
          >
            全て
          </Badge>
          {Object.entries(TYPE_LABELS).map(([key, { label }]) => (
            <Badge
              key={key}
              variant={activeType === key ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => handleTypeFilter(Number(key))}
            >
              {label}
            </Badge>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        全 {totalCount} 件
      </p>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>コード</TableHead>
            <TableHead>氏名</TableHead>
            <TableHead>電話番号</TableHead>
            <TableHead className="text-center">種別</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-muted-foreground"
              >
                顧客が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            customers.map((customer) => {
              const fullName = [customer.last_name, customer.first_name]
                .filter(Boolean)
                .join(" ") || "-";
              const typeInfo = TYPE_LABELS[customer.type] ?? TYPE_LABELS[0];

              return (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/customer/${customer.id}`)}
                >
                  <TableCell className="font-mono text-sm">
                    {customer.code}
                  </TableCell>
                  <TableCell className="font-medium">{fullName}</TableCell>
                  <TableCell>{customer.phone_number_1 || "-"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Link href={`/customer/${customer.id}`}>
                        <Button variant="ghost" size="sm" title="カルテ・詳細">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(customer.id, fullName)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
