"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TagTemplate } from "../types";
import { deleteTagTemplate } from "../actions/tagTemplateActions";

interface TagTemplateListProps {
  templates: TagTemplate[];
}

export function TagTemplateList({ templates }: TagTemplateListProps) {
  const router = useRouter();

  async function handleDelete(id: number, title: string) {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const result = await deleteTagTemplate(id);
    if (result.error) {
      toast.error("削除に失敗しました");
    } else {
      toast.success("削除しました");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/tag-template/register">
          <Button>+ 新規作成</Button>
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead>メモ</TableHead>
            <TableHead className="w-32">作成日</TableHead>
            <TableHead className="w-32">更新日</TableHead>
            <TableHead className="w-28 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                タグテンプレートが作成されていません
              </TableCell>
            </TableRow>
          ) : (
            templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.id}</TableCell>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                  {t.memo ?? ""}
                </TableCell>
                <TableCell className="text-xs">
                  {t.created_at?.slice(0, 10)}
                </TableCell>
                <TableCell className="text-xs">
                  {t.updated_at?.slice(0, 10)}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Link href={`/tag-template/${t.id}`}>
                      <Button size="sm" variant="ghost" title="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="削除"
                      onClick={() => handleDelete(t.id, t.title)}
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
