"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ExternalLink,
  Send,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
} from "lucide-react";
import {
  createAgreement,
  notifyAgreement,
  cancelAgreement,
  deleteAgreement,
  setupMembershipTemplate,
} from "../actions/agreementActions";
import {
  AGREEMENT_KIND_LABEL,
  AGREEMENT_STATUS_LABEL,
  type AgreementRow,
  type AgreementTemplate,
} from "../types";

interface Props {
  customerId: number;
  brandId: number;
  agreements: AgreementRow[];
  membershipTemplate: AgreementTemplate | null;
  templateDiagnostic?: string;
  baseUrl: string;
}

/**
 * 顧客詳細ページに埋め込む同意書管理セクション。
 *
 * - 上部: 「会員申込書を作成」フォーム (月額 / 開始日 → リンク発行)
 * - 下部: 既存リンク一覧 (status バッジ + 送信 / リンクコピー / 取消)
 *
 * 領収書は将来別タブとして同じパターンで追加できる構造。
 */
export function AgreementSection({
  customerId,
  brandId,
  agreements,
  membershipTemplate,
  templateDiagnostic,
  baseUrl,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [planAmount, setPlanAmount] = useState("");
  const [startDate, setStartDate] = useState("");

  function genMembership() {
    if (!membershipTemplate) {
      toast.error("会員申込書テンプレートが見つかりません");
      return;
    }
    const amt = Number(planAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("月額会費を入力してください");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      toast.error("契約開始日を入力してください");
      return;
    }
    // 次回引き落とし日 = 契約開始日 + 1 ヶ月。1/31 → 2/28 のような
    // 月末調整はブラウザ Date に任せる (setMonth はオーバーフローしたら
    // 自動で次月にずれるので、 setDate で 0 にすると当該月の末日に
    // クリップできる)。
    const nextBilling = (() => {
      const [y, m, d] = startDate.split("-").map(Number);
      const target = new Date(Date.UTC(y, m, d)); // m はそのまま渡すと +1 月扱い
      // 開始日が月末を超える場合 (例: 1/31 + 1 month → 3/3 になる) を
      // 防ぐため、月末でクリップ。
      if (target.getUTCDate() !== d) {
        target.setUTCDate(0); // 翌月の 0 日 = 当該月末
      }
      const ny = target.getUTCFullYear();
      const nm = String(target.getUTCMonth() + 1).padStart(2, "0");
      const nd = String(target.getUTCDate()).padStart(2, "0");
      return `${ny}-${nm}-${nd}`;
    })();
    start(async () => {
      const res = await createAgreement({
        customerId,
        templateId: membershipTemplate.id,
        vars: {
          plan_amount_yen: amt.toLocaleString(),
          contract_start_date: startDate,
          next_billing_date: nextBilling,
        },
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("リンクを発行しました");
      setPlanAmount("");
      setStartDate("");
      router.refresh();
    });
  }

  function notify(uuid: string) {
    start(async () => {
      const res = await notifyAgreement({ uuid, via: "auto" });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const label =
        res.via === "both"
          ? "LINE とメール"
          : res.via === "line"
            ? "LINE"
            : "メール";
      toast.success(`${label} で送信しました`);
      router.refresh();
    });
  }

  function copyLink(uuid: string) {
    const link = `${baseUrl.replace(/\/$/, "")}/agree/${uuid}`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(link).then(
        () => toast.success("リンクをコピーしました"),
        () => toast.error("コピーに失敗しました")
      );
    } else {
      toast.info(link);
    }
  }

  function doCancel(uuid: string) {
    if (!confirm("この同意書を取消します。よろしいですか？")) return;
    start(async () => {
      const res = await cancelAgreement(uuid);
      if (res.error) toast.error(res.error);
      else {
        toast.success("取消しました");
        router.refresh();
      }
    });
  }

  function doDelete(id: number) {
    if (!confirm("削除します。署名済みの場合は記録が消えます。よろしいですか？"))
      return;
    start(async () => {
      const res = await deleteAgreement(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("削除しました");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* 会員申込書 発行フォーム */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-bold">会員申込書を発行</h3>
            <p className="text-[11px] text-gray-500">
              月額 / 契約開始日を入力してリンクを作成し、LINE またはメールで顧客に送付すると
              スマホから署名できます。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label className="text-[10px]">月額会費 (税込)</Label>
              <Input
                type="number"
                min={0}
                step={100}
                value={planAmount}
                onChange={(e) => setPlanAmount(e.target.value)}
                placeholder="例: 24750"
              />
            </div>
            <div>
              <Label className="text-[10px]">契約開始日</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                onClick={genMembership}
                disabled={pending || !membershipTemplate}
                className="w-full"
              >
                <Plus className="mr-1 h-3 w-3" />
                リンク発行
              </Button>
            </div>
          </div>
          {!membershipTemplate && (
            <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50/50 p-3">
              <p className="text-xs text-rose-800">
                ⚠ 会員申込書テンプレートが用意されていません。
              </p>
              {templateDiagnostic && (
                <p className="break-all text-[10px] text-rose-700">
                  原因: {templateDiagnostic}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    const res = await setupMembershipTemplate({ brandId });
                    if (res.error) {
                      toast.error(res.error, { duration: 12000 });
                      return;
                    }
                    toast.success("テンプレートを作成しました");
                    router.refresh();
                  });
                }}
              >
                テンプレートを自動作成する
              </Button>
              <p className="text-[10px] text-gray-500">
                ボタンが失敗する場合は Supabase ダッシュボード → SQL Editor で
                <code className="mx-1 rounded bg-gray-100 px-1 text-[10px]">
                  supabase/migrations/00042_agreements.sql
                </code>
                を最後まで実行してください。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 既存同意書 一覧 */}
      <div className="space-y-2">
        {agreements.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-xs text-gray-400">
              まだ同意書はありません
            </CardContent>
          </Card>
        ) : (
          agreements.map((a) => {
            const link = `${baseUrl.replace(/\/$/, "")}/agree/${a.uuid}`;
            const statusColor =
              a.status === "signed"
                ? "bg-emerald-100 text-emerald-800"
                : a.status === "cancelled"
                  ? "bg-gray-200 text-gray-600"
                  : "bg-amber-100 text-amber-800";
            return (
              <Card key={a.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {AGREEMENT_KIND_LABEL[a.kind]}
                    </Badge>
                    <Badge className={statusColor}>
                      {a.status === "signed" && (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {AGREEMENT_STATUS_LABEL[a.status]}
                    </Badge>
                    <span className="text-[11px] text-gray-500">
                      {new Date(a.createdAt).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                      })}
                    </span>
                    {a.signedAt && (
                      <span className="text-[11px] text-emerald-700">
                        署名:{" "}
                        {new Date(a.signedAt).toLocaleString("ja-JP", {
                          timeZone: "Asia/Tokyo",
                        })}
                      </span>
                    )}
                    {a.notifiedAt && (
                      <span className="text-[11px] text-blue-700">
                        送信済 ({a.notifiedVia})
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/agree/${a.uuid}`} target="_blank">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        開く
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(a.uuid)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      リンクコピー
                    </Button>
                    {a.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => notify(a.uuid)}
                      >
                        <Send className="mr-1 h-3 w-3" />
                        {a.status === "signed"
                          ? "署名済み控えを送信"
                          : "LINE / メール送信"}
                      </Button>
                    )}
                    {a.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => doCancel(a.uuid)}
                        className="text-rose-600"
                      >
                        取消
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => doDelete(a.id)}
                      className="text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="truncate text-[10px] font-mono text-gray-400">
                    {link}
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
