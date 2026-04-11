"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { Question, Questionnaire } from "../types";
import { submitQuestionnaireResponse } from "../actions/questionnaireActions";

interface PublicQuestionnaireFormProps {
  questionnaire: Questionnaire;
}

export function PublicQuestionnaireForm({
  questionnaire,
}: PublicQuestionnaireFormProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
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
}: {
  index: number;
  question: Question;
  value: string | string[] | undefined;
  onChange: (v: string) => void;
  onToggleCheckbox: (opt: string) => void;
}) {
  const checkboxValue = Array.isArray(value) ? value : [];
  const textValue = typeof value === "string" ? value : "";

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Label className="text-sm font-bold">
          Q{index}. {question.label}
          {question.required && <span className="ml-1 text-red-500">*</span>}
        </Label>

        {question.type === "text" && (
          <Input
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? ""}
          />
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
