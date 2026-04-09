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
import { Pencil, Trash2, Link as LinkIcon } from "lucide-react";
import { deleteFacility } from "../actions/facilityActions";
import { toast } from "sonner";

interface Facility {
  id: number;
  name: string;
  max_book_count: number;
  allocate_order: number;
}

interface FacilityListProps {
  facilities: Facility[];
}

export function FacilityList({ facilities }: FacilityListProps) {
  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const result = await deleteFacility(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("設備を削除しました");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>設備名</TableHead>
          <TableHead className="text-center">受付可能数</TableHead>
          <TableHead className="text-center">振り分け順</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {facilities.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              設備が登録されていません
            </TableCell>
          </TableRow>
        ) : (
          facilities.map((facility) => (
            <TableRow key={facility.id}>
              <TableCell className="font-medium">{facility.name}</TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary">{facility.max_book_count}</Badge>
              </TableCell>
              <TableCell className="text-center">
                {facility.allocate_order}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link href={`/facility/${facility.id}/assignment`}>
                    <Button variant="ghost" size="sm" title="対応メニュー">
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(facility.id, facility.name)}
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
