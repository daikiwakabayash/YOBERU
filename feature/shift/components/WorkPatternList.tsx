"use client";

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
import { Trash2 } from "lucide-react";
import { deleteWorkPattern } from "../actions/shiftActions";
import { toast } from "sonner";

interface WorkPattern {
  id: number;
  name: string;
  abbreviation_name: string | null;
  abbreviation_color: string | null;
  start_time: string;
  end_time: string;
}

interface WorkPatternListProps {
  patterns: WorkPattern[];
}

export function WorkPatternList({ patterns }: WorkPatternListProps) {
  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const result = await deleteWorkPattern(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("出勤パターンを削除しました");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>パターン名</TableHead>
          <TableHead>略称</TableHead>
          <TableHead>開始時間</TableHead>
          <TableHead>終了時間</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {patterns.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-muted-foreground py-8"
            >
              出勤パターンが登録されていません
            </TableCell>
          </TableRow>
        ) : (
          patterns.map((pattern) => (
            <TableRow key={pattern.id}>
              <TableCell className="font-medium">{pattern.name}</TableCell>
              <TableCell>
                {pattern.abbreviation_name && (
                  <Badge
                    style={{
                      backgroundColor: pattern.abbreviation_color || undefined,
                      color: "#fff",
                    }}
                  >
                    {pattern.abbreviation_name}
                  </Badge>
                )}
              </TableCell>
              <TableCell>{pattern.start_time?.slice(0, 5)}</TableCell>
              <TableCell>{pattern.end_time?.slice(0, 5)}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(pattern.id, pattern.name)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
