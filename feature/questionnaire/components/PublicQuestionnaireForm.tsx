"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { Question, Questionnaire } from "../types";
import { submitQuestionnaireResponse } from "../actions/questionnaireActions";
import { lookupZipCodeAddress } from "../utils/lookupZipCode";

interface PublicQuestionnaireFormProps {
  questionnaire: Questionnaire;
  /** 送信成功時の挙動を上書きしたい場合に指定 (例: 管理画面から登録時に
   *  完了画面ではなく顧客詳細へ遷移させる)。デフォルトは「ご回答
   *  ありがとうございます」の完了画面を表示する。 */
  onCompleted?: (result: { customerId: number | null }) => void;
}

export function PublicQuestionnaireForm({
  questionnaire,
  onCompleted,
}: PublicQuestionnaireFormProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [zipLookingUp, setZipLookingUp] = useState(false);

  // 郵便番号 / 住所 の紐付け (field = "zip_code" / "address") を事前検出。
  // 問診票に含まれない場合は null のまま = 何もしない。
  const { zipQuestionId, addressQuestionId } = useMemo(() => {
    let zipId: string | null = null;
    let addrId: string | null = null;
    for (const q of questionnaire.questions) {
      if (q.field === "zip_code" && zipId === null) zipId = q.id;
      if (q.field === "address" && addrId === null) addrId = q.id;
    }
    return { zipQuestionId: zipId, addressQuestionId: addrId };
  }, [questionnaire.questions]);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));

    // 郵便番号 → 住所 の自動補完。
    //   - 7 桁揃ったタイミングで zipcloud API を叩く
    //   - 住所欄が既に入力済みなら上書きしない (市区町村の後の番地等を
    //     ユーザーが追記済みのケースを壊さない)
    if (
      id === zipQuestionId &&
      addressQuestionId &&
      typeof value === "string"
    ) {
      const digits = value.replace(/[^0-9]/g, "");
      if (digits.length === 7) {
        setZipLookingUp(true);
        lookupZipCodeAddress(digits)
          .then((address) => {
            if (!address) return;
            setAnswers((prev) => {
              const existing = prev[addressQuestionId];
              if (typeof existing === "string" && existing.trim() !== "") {
                return prev;
              }
              return { ...prev, [addressQuestionId]: address };
            });
          })
          .finally(() => setZipLookingUp(false));
      }
    }
  }

  function toggleCheckbox(id: string, option: string) {
    const current = (answers[id] as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setAnswer(id, next);
  }

  async function handleSubmit() {
    // Validate required fields
    for (const q of questionnaire.questions) {
      if (!q.required) continue;
      const val = answers[q.id];
      const empty =
        val == null ||
        val === "" ||
        (Array.isArray(val) && val.length === 0);
      if (empty) {
        toast.error(`「${q.label}」は必須です`);
        return;
      }
    }

    setSubmitting(true);
    const form = new FormData();
    form.set("questionnaire_id", String(questionnaire.id));
    form.set("answers", JSON.stringify(answers));
    const result = await submitQuestionnaireResponse(form);
    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if (onCompleted) {
      const customerId =
        "customerId" in result ? (result.customerId ?? null) : null;
      onCompleted({ customerId });
      return;
    }
    setCompleted(true);
  }

  if (completed) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">ご回答ありがとうございます</h2>
          <p className="text-center text-sm text-gray-600">
            ご来院時にお待ちしております。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {questionnaire.questions.map((q, i) => (
        <QuestionRow
          key={q.id}
          index={i + 1}
          question={q}
          value={answers[q.id]}
          onChange={(v) => setAnswer(q.id, v)}
          onToggleCheckbox={(opt) => toggleCheckbox(q.id, opt)}
          zipLookingUp={q.id === zipQuestionId && zipLookingUp}
        />
      ))}

      <Button
        size="lg"
        className="w-full text-base font-bold"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? "送信中..." : "回答を送信する"}
      </Button>
    </div>
  );
}

function QuestionRow({
  index,
  question,
  value,
  onChange,
  onToggleCheckbox,
  zipLookingUp = false,
}: {
  index: number;
  question: Question;
  value: string | string[] | undefined;
  onChange: (v: string) => void;
  onToggleCheckbox: (opt: string) => void;
  zipLookingUp?: boolean;
}) {
  const checkboxValue = Array.isArray(value) ? value : [];
  const textValue = typeof value === "string" ? value : "";
  const isZipField = question.field === "zip_code";

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Label className="text-sm font-bold">
          Q{index}. {question.label}
          {question.required && <span className="ml-1 text-red-500">*</span>}
        </Label>

        {question.type === "text" && (
          <>
            <Input
              value={textValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={
                isZipField
                  ? "1600023"
                  : question.placeholder ?? ""
              }
              inputMode={isZipField ? "numeric" : undefined}
              maxLength={isZipField ? 8 : undefined}
            />
            {isZipField && (
              <p className="text-xs text-muted-foreground">
                {zipLookingUp
                  ? "住所を検索しています..."
                  : "7 桁を入力すると住所欄が自動補完されます (ハイフン有無どちらでも可)"}
              </p>
            )}
          </>
        )}

        {question.type === "text_kana" && (
          <Input
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder="例: ヤマダ タロウ"
          />
        )}

        {question.type === "textarea" && (
          <Textarea
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            placeholder={question.placeholder ?? ""}
          />
        )}

        {question.type === "date" && (
          <Input
            type="date"
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {question.type === "number" && (
          <Input
            type="number"
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {question.type === "tel" && (
          <Input
            type="tel"
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder="09012345678"
            maxLength={11}
          />
        )}

        {question.type === "email" && (
          <Input
            type="email"
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder="example@mail.com"
          />
        )}

        {question.type === "radio" && (
          <div className="space-y-2">
            {(question.options ?? []).map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              >
                <input
                  type="radio"
                  checked={textValue === opt}
                  onChange={() => onChange(opt)}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        )}

        {question.type === "checkbox" && (
          <div className="space-y-2">
            {(question.options ?? []).map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={checkboxValue.includes(opt)}
                  onChange={() => onToggleCheckbox(opt)}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
