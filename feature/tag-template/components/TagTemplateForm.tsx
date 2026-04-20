"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { TagTemplate } from "../types";
import {
  createTagTemplate,
  updateTagTemplate,
} from "../actions/tagTemplateActions";

interface TagTemplateFormProps {
  brandId: number;
  initialData?: TagTemplate;
}

export function TagTemplateForm({ brandId, initialData }: TagTemplateFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [memo, setMemo] = useState(initialData?.memo ?? "");
  const [sortNumber, setSortNumber] = useState<number>(
    initialData?.sort_number ?? 0
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.set("brand_id", String(brandId));
    form.set("title", title.trim());
    form.set("content", content);
    form.set("memo", memo ?? "");
    form.set("sort_number", String(sortNumber));

    const result = isEdit
      ? await updateTagTemplate(initialData!.id, form)
      : await createTagTemplate(form);
    setSaving(false);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "保存に失敗しました"
      );
      return;
    }
    toast.success(isEdit ? "更新しました" : "作成しました");
    router.push("/tag-template");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              タイトル <span className="text-red-500">(必須)</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: headタグ / body直下"
            />
          </div>
          <div className="space-y-2">
            <Label>タグ本文</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              placeholder={`<!-- Google Tag Manager -->\n<script>...</script>\n<!-- End Google Tag Manager -->`}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              強制リンクの公開ページ (/book/&lt;slug&gt;) で
              <code className="mx-1 rounded bg-gray-100 px-1">
                document.head
              </code>
              または
              <code className="mx-1 rounded bg-gray-100 px-1">
                document.body
              </code>
              に注入されます。&lt;script&gt; 要素は自動で実行されます。
            </p>
          </div>
          <div className="space-y-2">
            <Label>メモ</Label>
            <Textarea
              value={memo ?? ""}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="管理メモ (任意)"
            />
          </div>
          <div className="space-y-2">
            <Label>表示順</Label>
            <Input
              type="number"
              value={sortNumber}
              onChange={(e) => setSortNumber(Number(e.target.value) || 0)}
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "保存中..." : isEdit ? "更新する" : "作成する"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/tag-template")}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
