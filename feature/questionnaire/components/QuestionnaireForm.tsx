"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { Questionnaire, Question, QuestionType } from "../types";
import {
  createQuestionnaire,
  updateQuestionnaire,
} from "../actions/questionnaireActions";

interface QuestionnaireFormProps {
  brandId: number;
  shopId?: number;
  initialData?: Questionnaire;
}

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "text", label: "短文テキスト" },
  { value: "textarea", label: "長文テキスト" },
  { value: "text_kana", label: "カナ" },
  { value: "radio", label: "単一選択" },
  { value: "checkbox", label: "複数選択" },
  { value: "date", label: "日付" },
  { value: "number", label: "数値" },
  { value: "tel", label: "電話番号" },
  { value: "email", label: "メール" },
];

const FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "— 連動なし —" },
  { value: "full_name", label: "氏名 (姓名分割)" },
  { value: "full_name_kana", label: "氏名カナ (姓名分割)" },
  { value: "phone_number_1", label: "電話番号" },
  { value: "email", label: "メールアドレス" },
  { value: "gender", label: "性別" },
  { value: "birth_date", label: "生年月日" },
  { value: "zip_code", label: "郵便番号" },
  { value: "address", label: "住所" },
  { value: "occupation", label: "職業" },
  { value: "description", label: "備考 (来院動機/症状など)" },
];

function genId() {
  return `q${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSeedQuestions(): Question[] {
  return [
    { id: genId(), type: "text", label: "お名前", required: true, field: "full_name" },
    {
      id: genId(),
      type: "text_kana",
      label: "お名前（カナ）",
      required: true,
      field: "full_name_kana",
    },
    {
      id: genId(),
      type: "radio",
      label: "性別",
      required: true,
      options: ["男性", "女性"],
      field: "gender",
    },
    { id: genId(), type: "date", label: "生年月日", required: true, field: "birth_date" },
    {
      id: genId(),
      type: "text",
      label: "郵便番号",
      required: true,
      field: "zip_code",
    },
    { id: genId(), type: "text", label: "住所", field: "address" },
    { id: genId(), type: "tel", label: "電話番号", required: true, field: "phone_number_1" },
    { id: genId(), type: "email", label: "メールアドレス", field: "email" },
    {
      id: genId(),
      type: "textarea",
      label: "来院動機",
      field: "description",
    },
    { id: genId(), type: "textarea", label: "症状・痛む場所" },
  ];
}

export function QuestionnaireForm({
  brandId,
  shopId,
  initialData,
}: QuestionnaireFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [isPublic, setIsPublic] = useState(initialData?.is_public ?? true);
  const [questions, setQuestions] = useState<Question[]>(
    initialData?.questions ?? defaultSeedQuestions()
  );
  const [saving, setSaving] = useState(false);

  function addQuestion() {
    setQuestions([
      ...questions,
      { id: genId(), type: "text", label: "新しい質問" },
    ]);
  }

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const next = [...questions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
  }

  async function handleSubmit() {
    if (!slug.trim() || !title.trim()) {
      toast.error("タイトルとスラッグを入力してください");
      return;
    }
    if (questions.length === 0) {
      toast.error("質問を1つ以上追加してください");
      return;
    }
    setSaving(true);
    const payload = {
      brand_id: brandId,
      shop_id: shopId ?? null,
      slug: slug.trim(),
      title: title.trim(),
      description: description || null,
      questions,
      is_public: isPublic,
    };
    const result = isEdit
      ? await updateQuestionnaire(initialData!.id, payload)
      : await createQuestionnaire(payload);
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(String(result.error));
      return;
    }
    toast.success(isEdit ? "更新しました" : "作成しました");
    router.push("/questionnaire");
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
              placeholder="例: 新宿三丁目店 問診票"
            />
          </div>
          <div className="space-y-2">
            <Label>
              URLスラッグ <span className="text-red-500">(必須)</span>
            </Label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">/q/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="shinjuku-3chome"
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>説明文（フォーム上部に表示）</Label>
            <Textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="当日ご来院までに必ず問診票の記入をお願い致します。"
            />
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            <span className="text-sm">公開する</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">質問 ({questions.length}件)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className="space-y-3 rounded-md border border-gray-200 bg-gray-50/40 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">
                  Q{i + 1}
                </span>
                <div className="flex gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => moveQuestion(i, -1)}
                    className="h-6 w-6 p-0"
                  >
                    <GripVertical className="h-3 w-3 rotate-180" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === questions.length - 1}
                    onClick={() => moveQuestion(i, 1)}
                    className="h-6 w-6 p-0"
                  >
                    <GripVertical className="h-3 w-3" />
                  </Button>
                </div>
                <select
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(i, { type: e.target.value as QuestionType })
                  }
                  className="h-8 rounded border px-2 text-xs"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label className="ml-auto flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={q.required ?? false}
                    onChange={(e) =>
                      updateQuestion(i, { required: e.target.checked })
                    }
                  />
                  必須
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeQuestion(i)}
                >
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>

              <Input
                value={q.label}
                onChange={(e) => updateQuestion(i, { label: e.target.value })}
                placeholder="質問の見出し"
              />

              {(q.type === "radio" || q.type === "checkbox") && (
                <div className="space-y-1">
                  <Label className="text-xs">選択肢（1行1つ）</Label>
                  <Textarea
                    value={(q.options ?? []).join("\n")}
                    onChange={(e) =>
                      updateQuestion(i, {
                        options: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={3}
                    className="text-xs"
                    placeholder={"男性\n女性"}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-gray-500">
                  顧客データとの連動
                </Label>
                <select
                  value={q.field ?? ""}
                  onChange={(e) =>
                    updateQuestion(i, { field: e.target.value || undefined })
                  }
                  className="h-8 w-full rounded border px-2 text-xs"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addQuestion}>
            <Plus className="mr-1 h-4 w-4" />
            質問を追加
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "保存中..." : isEdit ? "更新する" : "作成する"}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/questionnaire")}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
}
