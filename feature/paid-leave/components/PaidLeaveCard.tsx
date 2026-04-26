"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import {
  createPaidLeave,
  deletePaidLeave,
  type LeaveType,
} from "../actions/paidLeaveActions";
import type { StaffPaidLeaveSummary } from "../services/getPaidLeaveSummary";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  summary: StaffPaidLeaveSummary;
}

const labelOf = (t: string) =>
  t === "full" ? "全休" : t === "half_am" ? "午前半休" : "午後半休";

export function PaidLeaveCard({ summary }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [type, setType] = useState<LeaveType>("full");
  const [reason, setReason] = useState("");

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("日付を入力してください");
      return;
    }
    start(async () => {
      const res = await createPaidLeave({
        staffId: summary.staffId,
        leaveDate: date,
        leaveType: type,
        reason: reason.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("有給を登録しました");
      setDate("");
      setReason("");
      router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("この有給記録を削除します。よろしいですか？")) return;
    start(async () => {
      const res = await deletePaidLeave(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("削除しました");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">{summary.staffName}</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
              付与: <span className="font-bold">{summary.grantedDays} 日</span>
            </span>
            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">
              当年消化:{" "}
              <span className="font-bold">{summary.usedDays} 日</span>
            </span>
            <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
              残: <span className="font-bold">{summary.remainingDays} 日</span>
            </span>
          </div>
        </div>

        {summary.upcomingExpiry && (
          <p className="text-[11px] text-gray-500">
            直近付与: {summary.upcomingExpiry.grantedAt} ({summary.upcomingExpiry.days}{" "}
            日) / 失効予定: {summary.upcomingExpiry.expiresAt}
          </p>
        )}

        {/* 履歴 */}
        {summary.rows.length === 0 ? (
          <p className="text-xs text-gray-400">有給の記録はまだありません</p>
        ) : (
          <ul className="divide-y rounded border text-xs">
            {summary.rows.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-24 shrink-0 tabular-nums">{r.leaveDate}</span>
                <Badge variant="outline" className="shrink-0">
                  {labelOf(r.leaveType)}
                </Badge>
                <span
                  className="flex-1 truncate text-gray-600"
                  title={r.reason ?? ""}
                >
                  {r.reason ?? "—"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(r.id)}
                  className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 追加 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_140px_1fr_auto]">
          <div>
            <Label className="text-[10px] text-gray-500">取得日</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">単位</Label>
            <select
              className="w-full rounded border px-2 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
            >
              <option value="full">全休</option>
              <option value="half_am">午前半休</option>
              <option value="half_pm">午後半休</option>
            </select>
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">理由 (任意)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 私用 / 通院"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={pending}
              className="w-full"
            >
              <Plus className="mr-1 h-3 w-3" />
              登録
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
