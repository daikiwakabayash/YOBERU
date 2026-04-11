"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Download, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import type { Questionnaire } from "../types";
import { deleteQuestionnaire } from "../actions/questionnaireActions";

interface QuestionnaireListProps {
  questionnaires: Questionnaire[];
}

export function QuestionnaireList({ questionnaires }: QuestionnaireListProps) {
  const router = useRouter();
  const [exportingId, setExportingId] = useState<number | null>(null);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const result = await deleteQuestionnaire(id);
    if (result.error) {
      toast.error("削除に失敗しました");
    } else {
      toast.success("削除しました");
      router.refresh();
    }
  }

  function copyPublicUrl(slug: string) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/q/${slug}`);
    toast.success("公開URLをコピーしました");
  }

  async function handleExportCsv(id: number, title: string) {
    setExportingId(id);
    try {
      const res = await fetch(`/api/questionnaire/${id}/export`);
      if (!res.ok) throw new Error("CSV書き出しに失敗しました");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `questionnaire-${id}-${title}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("CSVをダウンロードしました");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "ダウンロードに失敗しました"
      );
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/questionnaire/register">
          <Button>+ 新規作成</Button>
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead>スラッグ</TableHead>
            <TableHead className="text-center">質問数</TableHead>
            <TableHead className="w-32">作成日</TableHead>
            <TableHead className="w-56 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questionnaires.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                問診票が作成されていません
              </TableCell>
            </TableRow>
          ) : (
            questionnaires.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-xs">{q.id}</TableCell>
                <TableCell className="font-medium">{q.title}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  /q/{q.slug}
                </TableCell>
                <TableCell className="text-center">
                  {(q.questions ?? []).length}
                </TableCell>
                <TableCell className="text-xs">
                  {q.created_at?.slice(0, 10)}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="URLをコピー"
                      onClick={() => copyPublicUrl(q.slug)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Link
                      href={`/q/${q.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="ghost" title="プレビュー">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href={`/questionnaire/${q.id}`}>
                      <Button size="sm" variant="ghost" title="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="回答CSV"
                      disabled={exportingId === q.id}
                      onClick={() => handleExportCsv(q.id, q.title)}
                    >
                      <Download className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="削除"
                      onClick={() => handleDelete(q.id, q.title)}
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
