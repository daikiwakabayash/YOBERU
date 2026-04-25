"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { savePayrollEmailTemplate } from "../actions/payrollSettingsActions";

interface Props {
  brandId: number;
  initialSubject: string | null;
  initialBody: string | null;
}

const DEFAULT_SUBJECT_HINT =
  "{{year_month}} 月分 業務委託費 請求書 ({{shop_name}})";
const DEFAULT_BODY_HINT = `{{staff_name}} 様

{{year_month}} 月分の請求書をお送りします。
ご確認のほど宜しくお願いいたします。

請求金額 (税込): {{total}}
発行日: {{issue_date}}
発行元: {{shop_name}}

詳細は本文 HTML をご確認ください。`;

export function PayrollEmailTemplateForm({
  brandId,
  initialSubject,
  initialBody,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");

  function submit() {
    start(async () => {
      const res = await savePayrollEmailTemplate({
        brandId,
        subjectTemplate: subject || null,
        bodyTemplate: body || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("テンプレートを保存しました");
      router.refresh();
    });
  }

  function reset() {
    if (!confirm("入力をデフォルト (空白 = 既定本文) に戻しますか？")) return;
    setSubject("");
    setBody("");
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-xs text-gray-500">
            利用可能なプレースホルダ:{" "}
            <code className="rounded bg-gray-100 px-1">{`{{staff_name}}`}</code>{" "}
            <code className="rounded bg-gray-100 px-1">{`{{year_month}}`}</code>{" "}
            <code className="rounded bg-gray-100 px-1">{`{{shop_name}}`}</code>{" "}
            <code className="rounded bg-gray-100 px-1">{`{{total}}`}</code>{" "}
            <code className="rounded bg-gray-100 px-1">{`{{issue_date}}`}</code>
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="subject">件名テンプレート</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={DEFAULT_SUBJECT_HINT}
          />
          <p className="text-[10px] text-gray-400">
            空欄のまま保存すると既定の件名 ({DEFAULT_SUBJECT_HINT}) が使われます
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="body">本文テンプレート (プレーンテキスト)</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={DEFAULT_BODY_HINT}
            rows={12}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-gray-400">
            空欄のまま保存すると既定本文 (上記プレースホルダ展開済み) が使われます。
            HTML 版は明細テーブルが自動添付されます。
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={pending}>
            <Save className="mr-1 h-4 w-4" />
            {pending ? "保存中..." : "テンプレートを保存"}
          </Button>
          <Button variant="outline" onClick={reset} disabled={pending}>
            既定に戻す
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
