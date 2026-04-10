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
import { Copy, Trash2, Pencil, Files } from "lucide-react";
import { toast } from "sonner";
import type { BookingLink } from "../types";
import {
  deleteBookingLink,
  duplicateBookingLink,
} from "../actions/bookingLinkActions";

interface BookingLinkListProps {
  links: BookingLink[];
}

export function BookingLinkList({ links }: BookingLinkListProps) {
  const router = useRouter();
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const result = await deleteBookingLink(id);
    if ("error" in result && result.error) {
      toast.error("削除に失敗しました");
    } else {
      toast.success("削除しました");
    }
  }

  async function handleDuplicate(id: number, title: string) {
    setDuplicatingId(id);
    const result = await duplicateBookingLink(id);
    setDuplicatingId(null);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`「${title}」をコピーしました`);
    // Navigate to the new link's edit page
    if ("id" in result && result.id) {
      router.push(`/booking-link/${result.id}`);
    }
  }

  function copyUrl(slug: string, utm?: "meta" | "hp") {
    const base =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = utm
      ? `${base}/book/${slug}?utm_source=${utm}`
      : `${base}/book/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success(
      utm ? `${utm.toUpperCase()}用URLをコピーしました` : "URLをコピーしました"
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/booking-link/register">
          <Button>+ 新規作成</Button>
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">ID</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead>スラッグ</TableHead>
            <TableHead className="w-24">作成日</TableHead>
            <TableHead className="w-60 text-center">URL操作</TableHead>
            <TableHead className="w-40 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                予約リンクが作成されていません
              </TableCell>
            </TableRow>
          ) : (
            links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-mono text-xs">{link.id}</TableCell>
                <TableCell className="font-medium">{link.title}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  /book/{link.slug}
                </TableCell>
                <TableCell className="text-xs">
                  {link.created_at?.slice(0, 10)}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyUrl(link.slug)}
                      title="通常URL"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      通常
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyUrl(link.slug, "meta")}
                      title="Meta広告用"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Meta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyUrl(link.slug, "hp")}
                      title="HP用"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      HP
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Link href={`/booking-link/${link.id}`}>
                      <Button variant="ghost" size="sm" title="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="複製"
                      disabled={duplicatingId === link.id}
                      onClick={() => handleDuplicate(link.id, link.title)}
                    >
                      <Files className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="削除"
                      onClick={() => handleDelete(link.id, link.title)}
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
