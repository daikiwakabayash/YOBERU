"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ShieldCheck, Printer } from "lucide-react";
import { signAgreement } from "../actions/agreementActions";
import {
  applyAgreementVars,
  withDerivedAgreementVars,
  type AgreementRow,
} from "../types";
import { SignaturePad } from "./SignaturePad";

interface Props {
  agreement: AgreementRow;
}

/**
 * 領収書 (kind='receipt') 専用のビュー。
 * 顧客側の署名は不要、印刷ボタンのみ。
 */
function ReceiptView({ agreement }: Props) {
  const body = agreement.bodySnapshot ?? "";
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-6">
      <Card className="border-amber-200 bg-amber-50/40 print:hidden">
        <CardContent className="space-y-1 p-4">
          <div className="text-xs text-amber-800 font-bold">領収書</div>
          <p className="text-xs text-gray-600">
            下記の通り受領いたしました。控えとして保管してください。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 print:p-2">
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
            {body}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center print:hidden">
        <Button type="button" onClick={() => window.print()} size="lg">
          <Printer className="mr-2 h-4 w-4" />
          印刷 / PDF 保存
        </Button>
      </div>
    </div>
  );
}

/**
 * /agree/<uuid> 公開ページの署名フォーム。
 *
 * - 全文表示 (テンプレート + vars 埋め込み)
 * - 必須チェック項目を全部 ON にしないと送信不可
 * - 氏名タイプ + 電子署名 (canvas) の両方を要求
 * - 送信時刻 / IP / UA はサーバ側で記録 (signAgreement)
 *
 * 既に signed の場合は read-only の控え表示。
 */
export function AgreementForm({ agreement }: Props) {
  // 領収書は専用ビュー (署名不要)
  if (agreement.kind === "receipt") {
    return <ReceiptView agreement={agreement} />;
  }

  const router = useRouter();
  const [pending, start] = useTransition();
  const isSigned = agreement.status === "signed";
  const isCancelled = agreement.status === "cancelled";

  const requiredChecks = agreement.template?.requiredChecks ?? [];
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    if (isSigned) return agreement.agreedChecks ?? {};
    return Object.fromEntries(requiredChecks.map((c) => [c.key, false]));
  });
  const [name, setName] = useState(
    isSigned ? agreement.signedName ?? "" : agreement.customerName ?? ""
  );
  const [signature, setSignature] = useState<string>(
    isSigned ? agreement.signatureDataUrl ?? "" : ""
  );

  const allChecked = useMemo(
    () => requiredChecks.every((c) => checks[c.key]),
    [checks, requiredChecks]
  );

  // 表示用本文 (sign 済みなら body_snapshot をそのまま、未署名なら vars 適用済みプレビュー)
  // body_snapshot に未置換のプレースホルダ (旧バージョン由来の {{next_billing_date}} 等) が
  // 残っていれば、ここで派生 vars を当てて再置換する。
  // legal な署名内容そのものは変えず、レンダリング時のみフォールバック。
  const displayBody = useMemo(() => {
    if (isSigned && agreement.bodySnapshot) {
      if (!/\{\{\w+\}\}/.test(agreement.bodySnapshot)) {
        return agreement.bodySnapshot;
      }
      const enriched = withDerivedAgreementVars({
        ...agreement.vars,
        customer_name: agreement.customerName ?? agreement.signedName ?? "",
        signed_at: agreement.signedAt
          ? new Date(agreement.signedAt).toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            })
          : "",
      });
      return applyAgreementVars(agreement.bodySnapshot, enriched);
    }
    if (!agreement.template) return "";
    const enriched = withDerivedAgreementVars({
      ...agreement.vars,
      customer_name: agreement.customerName ?? "",
      signed_at: "（署名時に確定）",
    });
    return applyAgreementVars(agreement.template.bodyText, enriched);
  }, [agreement, isSigned]);

  function submit() {
    if (!allChecked) {
      toast.error("すべての確認項目にチェックを入れてください");
      return;
    }
    if (!name.trim()) {
      toast.error("お名前を入力してください");
      return;
    }
    if (!signature) {
      toast.error("署名欄にご署名をお願いします");
      return;
    }
    if (!confirm("入力した内容で同意・送信しますか？\n署名後の修正はできません。")) {
      return;
    }
    start(async () => {
      const res = await signAgreement({
        uuid: agreement.uuid,
        signedName: name.trim(),
        signatureDataUrl: signature,
        agreedChecks: checks,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("同意・送信が完了しました");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-6">
      {/* ヘッダー */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="space-y-1 p-4">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-bold">電子契約</span>
          </div>
          <h1 className="text-lg font-bold sm:text-xl">
            {agreement.template?.title ?? "契約書"}
          </h1>
          <p className="text-xs text-gray-600">
            内容をよくご確認のうえ、各項目にチェック・お名前のご入力・ご署名をお願いいたします。送信後、控えのリンクが LINE またはメールで届きます。
          </p>
          {isSigned && (
            <Badge className="mt-2 bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              署名済み (
              {new Date(agreement.signedAt!).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}
              )
            </Badge>
          )}
          {isCancelled && (
            <Badge className="mt-2 bg-rose-100 text-rose-800">この同意書は取消されました</Badge>
          )}
        </CardContent>
      </Card>

      {/* 本文 (全文表示 — 法的効力に必要) */}
      <Card>
        <CardContent className="p-4">
          <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-gray-800">
            {displayBody}
          </div>
        </CardContent>
      </Card>

      {/* チェック項目 */}
      {!isCancelled && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="text-sm font-bold">確認事項</div>
            {requiredChecks.length === 0 ? (
              <p className="text-xs text-gray-400">確認項目はありません</p>
            ) : (
              <ul className="space-y-2">
                {requiredChecks.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={!!checks[c.key]}
                        disabled={pending || isSigned}
                        onCheckedChange={(v) =>
                          setChecks((prev) => ({ ...prev, [c.key]: v === true }))
                        }
                        className="mt-0.5"
                      />
                      <span>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* 氏名 + 署名 */}
      {!isCancelled && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-bold">お名前と署名</div>
            <div className="space-y-1">
              <Label htmlFor="signed_name" className="text-xs">
                お名前 (ご本人様)
              </Label>
              <Input
                id="signed_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 山田 太郎"
                disabled={pending || isSigned}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ご署名</Label>
              <SignaturePad
                onChange={setSignature}
                initialDataUrl={isSigned ? agreement.signatureDataUrl : null}
                disabled={pending || isSigned}
              />
            </div>
            {!isSigned && (
              <Button
                type="button"
                onClick={submit}
                disabled={pending || !allChecked || !name || !signature}
                className="w-full"
                size="lg"
              >
                {pending ? "送信中..." : "同意して送信する"}
              </Button>
            )}
            {!isSigned && (
              <p className="text-[10px] text-gray-500">
                送信時刻 / 送信元 IP アドレス / 端末情報は法的証拠として記録されます。
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
