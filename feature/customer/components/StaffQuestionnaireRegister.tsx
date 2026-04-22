"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PublicQuestionnaireForm } from "@/feature/questionnaire/components/PublicQuestionnaireForm";
import type { Questionnaire } from "@/feature/questionnaire/types";
import { CustomerForm } from "./CustomerForm";
import { toast } from "sonner";
import { ClipboardList, UserPlus } from "lucide-react";

interface Props {
  brandId: number;
  shopId: number;
  staffs: { id: number; name: string }[];
  /** このブランド/店舗に登録済みの問診票。空なら CustomerForm しか
   *  表示されないフォールバックモードになる。 */
  questionnaires: Questionnaire[];
}

/**
 * 管理画面 (/customer/register) 用の顧客登録フォーム。
 *
 * 店舗で使用している「問診票」のテンプレを使って登録することで、
 * 公開予約フォーム経由でもスタッフ手入力でも同じ項目セットが
 * 埋まる (= カルテ側の情報粒度が揃う) のが目的。
 *
 * 表示ルール:
 *   - 問診票が 1 件以上ある場合: 問診票タブをデフォルト表示。回答を
 *     送信すると submitQuestionnaireResponse が:
 *       - customers の該当フィールドを更新
 *       - questionnaire_responses に 1 行 INSERT
 *       - 既存顧客が無ければ新規作成 (カルテ No は自動採番)
 *     を行う。
 *   - 問診票が 1 件も無い場合: 従来の CustomerForm (簡易入力) のみ。
 */
export function StaffQuestionnaireRegister({
  brandId,
  shopId,
  staffs,
  questionnaires,
}: Props) {
  const router = useRouter();

  // 初期選択: shop 専用 → NULL (ブランド共通) → created_at 順の 1 件目。
  const defaultQuestionnaire =
    questionnaires.find((q) => q.shop_id === shopId) ??
    questionnaires.find((q) => q.shop_id == null) ??
    questionnaires[0] ??
    null;

  const [selectedId, setSelectedId] = useState<number | null>(
    defaultQuestionnaire?.id ?? null
  );
  const [mode, setMode] = useState<"questionnaire" | "simple">(
    defaultQuestionnaire ? "questionnaire" : "simple"
  );

  const selected =
    questionnaires.find((q) => q.id === selectedId) ??
    defaultQuestionnaire;

  function handleCompleted(result: { customerId: number | null }) {
    toast.success("顧客を登録しました");
    if (result.customerId) {
      router.push(`/customer/${result.customerId}`);
    } else {
      router.push("/customer");
    }
  }

  // 問診票が一つも無い = 従来の簡易フォームのみ
  if (questionnaires.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          このブランドにはまだ問診票が登録されていません。問診票を「マスタ管理
          → 問診票」から作成すると、スタッフ登録画面にも同じ項目セットが
          表示されるようになります。
        </p>
        <CustomerForm brandId={brandId} shopId={shopId} staffs={staffs} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* モード切替 + 問診票選択 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-3">
        <div className="flex gap-1">
          <Button
            variant={mode === "questionnaire" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("questionnaire")}
          >
            <ClipboardList className="mr-1 h-4 w-4" />
            問診票で登録
          </Button>
          <Button
            variant={mode === "simple" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("simple")}
          >
            <UserPlus className="mr-1 h-4 w-4" />
            簡易入力
          </Button>
        </div>

        {mode === "questionnaire" && questionnaires.length > 1 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-xs text-gray-500">使用する問診票</span>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="h-9 rounded-md border px-2 text-sm"
            >
              {questionnaires.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                  {q.shop_id == null ? " (ブランド共通)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {mode === "questionnaire" && selected ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-xl font-bold">{selected.title}</h2>
            {selected.description && (
              <p className="mb-4 whitespace-pre-line text-sm text-gray-600">
                {selected.description}
              </p>
            )}
            <PublicQuestionnaireForm
              questionnaire={selected}
              onCompleted={handleCompleted}
            />
          </CardContent>
        </Card>
      ) : (
        <CustomerForm brandId={brandId} shopId={shopId} staffs={staffs} />
      )}
    </div>
  );
}
