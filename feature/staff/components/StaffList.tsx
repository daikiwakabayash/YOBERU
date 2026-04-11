"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Trash2 } from "lucide-react";
import { deleteStaff, updateStaffAllocateOrder } from "../actions/staffActions";
import { toast } from "sonner";

interface Staff {
  id: number;
  name: string;
  capacity: number;
  phone_number: string | null;
  is_public: boolean;
  allocate_order: number | null;
}

interface StaffListProps {
  staffs: Staff[];
}

export function StaffList({ staffs }: StaffListProps) {
  // Local state for allocate_order so users can edit inline
  const [orderState, setOrderState] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      staffs.map((s) => [s.id, String(s.allocate_order ?? "")])
    )
  );
  const [savingId, setSavingId] = useState<number | null>(null);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const result = await deleteStaff(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("スタッフを削除しました");
    }
  }

  async function handleSaveOrder(id: number) {
    const raw = orderState[id]?.trim();
    const num = Number(raw);
    if (raw === "" || isNaN(num) || num < 0) {
      toast.error("0以上の数値を入力してください");
      return;
    }
    setSavingId(id);
    const result = await updateStaffAllocateOrder(id, num);
    setSavingId(null);
    if (result.error) {
      toast.error("更新に失敗しました");
    } else {
      toast.success("優先順位を更新しました");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        ※ 優先順位：指名なし（お任せ）の予約が入った時に、数値の小さいスタッフから自動で割り当てられます。
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28 text-center">優先順位</TableHead>
            <TableHead>スタッフ名</TableHead>
            <TableHead className="text-center">受付可能数</TableHead>
            <TableHead>電話番号</TableHead>
            <TableHead className="text-center">公開状態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staffs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                スタッフが登録されていません
              </TableCell>
            </TableRow>
          ) : (
            staffs.map((staff) => (
              <TableRow key={staff.id}>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={orderState[staff.id] ?? ""}
                      onChange={(e) =>
                        setOrderState((prev) => ({
                          ...prev,
                          [staff.id]: e.target.value,
                        }))
                      }
                      className="h-8 w-14 text-center text-xs"
                      placeholder="—"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveOrder(staff.id)}
                      disabled={savingId === staff.id}
                      className="h-8 px-2 text-xs"
                    >
                      保存
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{staff.name}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{staff.capacity}</Badge>
                </TableCell>
                <TableCell>{staff.phone_number || "-"}</TableCell>
                <TableCell className="text-center">
                  {staff.is_public ? (
                    <Badge variant="default">公開</Badge>
                  ) : (
                    <Badge variant="outline">非公開</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/staff/${staff.id}`}>
                      <Button variant="ghost" size="sm" title="詳細">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(staff.id, staff.name)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
