"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Save, RotateCcw } from "lucide-react";
import { updateAgreementTemplate } from "../actions/agreementActions";
import { applyAgreementVars, type AgreementTemplate } from "../types";

interface Props {
  template: AgreementTemplate;
}

const PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "plan_amount_yen", description: "月額会費 (リンク発行時に入力)" },
  { key: "contract_start_date", description: "契約開始日 (リンク発行時に入力)" },
  {
    key: "next_billing_date",
    description:
      "次回引き落とし日 (契約開始日の 1 ヶ月後を自動算出。月末は次月末にクランプ)",
  },
  { key: "customer_name", description: "署名時に確定 (お申込み者氏名)" },
  { key: "signed_at", description: "署名時に確定 (Asia/Tokyo の日時)" },
  // 領収書用
  { key: "amount_yen", description: "領収書: 受領金額 (リンク発行時に入力)" },
  { key: "purpose", description: "領収書: 但し書き (リンク発行時に入力)" },
  { key: "issue_date", description: "領収書: 発行日 (リンク発行時に入力)" },
];

/**
 * 同意書テンプレート編集フォーム。
 *
 * - タイトル / 本文 (textarea) / 必須チェック項目を編集
 * - {{placeholder}} の説明と、右側にプレビュー (本文に仮値を当てた状態)
 * - 既に署名済みの agreements には body_snapshot で影響しないため安全
 */
export function AgreementTemplateEditor({ template }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.bodyText);
  const [checks, setChecks] = useState(template.requiredChecks);

  function addCheck() {
    setChecks((prev) => [
      ...prev,
      { key: `check_${prev.length + 1}`, label: "" },
    ]);
  }

  function removeCheck(idx: number) {
    setChecks((prev) => prev.filter((_, i) => i !== idx));
  }

  function setCheck(
    idx: number,
    field: "key" | "label",
    value: string
  ) {
    setChecks((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  }

  function reset() {
    if (!confirm("変更を破棄して保存済みの内容に戻します。よろしいですか？")) return;
    setTitle(template.title);
    setBody(template.bodyText);
    setChecks(template.requiredChecks);
  }

  function save() {
    start(async () => {
      const res = await updateAgreementTemplate({
        id: template.id,
        title,
        bodyText: body,
        requiredChecks: checks,
      });
      if (res.error) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      toast.success("テンプレートを保存しました");
      router.refresh();
    });
  }

  // プレビュー用に仮値を当てる
  const previewBody = applyAgreementVars(body, {
    plan_amount_yen: "24,750",
    contract_start_date: "2026-06-01",
    next_billing_date: "2026-07-01",
    customer_name: "（ご署名時に氏名が入ります）",
    signed_at: "（ご署名時に日時が入ります）",
    amount_yen: "8,800",
    purpose: "施術代として",
    issue_date: "2026-04-30",
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 編集フォーム */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-base font-bold">編集</h2>

          <div className="space-y-1">
            <Label className="text-xs">タイトル</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: NAORU整体 大分あけのアクロス院 会員お申し込み書"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">本文</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:border-gray-500 focus:outline-none"
            />
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer">
                使えるプレースホルダー (本文に書くと自動置換)
              </summary>
              <ul className="mt-1 space-y-0.5 pl-3">
                {PLACEHOLDERS.map((p) => (
                  <li key={p.key}>
                    <code className="rounded bg-gray-100 px-1 font-mono">
                      {`{{${p.key}}}`}
                    </code>{" "}
                    — {p.description}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* チェック項目 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">確認チェック項目</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addCheck}
              >
                <Plus className="mr-1 h-3 w-3" />
                追加
              </Button>
            </div>
            {checks.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                チェック項目はありません (確認なしで送信可になります)
              </p>
            ) : (
              <ul className="space-y-2">
                {checks.map((c, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-1 gap-1 rounded border bg-gray-50/50 p-2 sm:grid-cols-[140px_1fr_auto]"
                  >
                    <Input
                      value={c.key}
                      onChange={(e) => setCheck(i, "key", e.target.value)}
                      placeholder="key (例: agree_fee)"
                      className="font-mono text-xs"
                    />
                    <Input
                      value={c.label}
                      onChange={(e) => setCheck(i, "label", e.target.value)}
                      placeholder="表示文 (例: 月額会費の内容に同意します)"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCheck(i)}
                      className="text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex-1"
            >
              <Save className="mr-1 h-4 w-4" />
              {pending ? "保存中..." : "保存する"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={pending}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              元に戻す
            </Button>
          </div>

          <p className="text-[10px] text-gray-500">
            ※ 編集内容は「次に発行する同意書リンクから」反映されます。既に署名済みの契約書は
            送信時点の本文 (body_snapshot) が保存されているため変更されません。
          </p>
        </CardContent>
      </Card>

      {/* プレビュー */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-base font-bold">プレビュー</h2>
          <div className="rounded-md border bg-amber-50/40 p-3">
            <h3 className="text-sm font-bold">{title || "（タイトル未入力）"}</h3>
          </div>
          <div className="max-h-[480px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-white p-3 text-xs leading-relaxed text-gray-800">
            {previewBody}
          </div>
          {checks.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-700">確認項目:</p>
              <ul className="space-y-1 text-xs text-gray-700">
                {checks.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-gray-400">☐</span>
                    <span>{c.label || "(未入力)"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
