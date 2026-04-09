"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { deleteStaff } from "../actions/staffActions";
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
  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const result = await deleteStaff(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("スタッフを削除しました");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
              colSpan={5}
              className="py-8 text-center text-muted-foreground"
            >
              スタッフが登録されていません
            </TableCell>
          </TableRow>
        ) : (
          staffs.map((staff) => (
            <TableRow key={staff.id}>
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
  );
}
