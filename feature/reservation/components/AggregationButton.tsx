"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { BarChart3 } from "lucide-react";
import { runDailyAggregation } from "../actions/aggregationActions";
import { toast } from "sonner";

interface AggregationButtonProps {
  shopId: number;
  date: string;
}

export function AggregationButton({ shopId, date }: AggregationButtonProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    totalAppointments: number;
    completedAppointments: number;
    newCustomers: number;
    existingCustomers: number;
    totalSales: number;
  } | null>(null);

  const dateObj = new Date(date + "T00:00:00");
  const displayDate = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

  async function handleRun() {
    setRunning(true);
    const res = await runDailyAggregation(shopId, date);
    setRunning(false);

    if ("error" in res && res.error) {
      toast.error(res.error);
    } else if (res.summary) {
      setResult(res.summary);
      toast.success("集計が完了しました");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        <BarChart3 className="mr-1 h-4 w-4" />
        集計実行
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>日次集計</DialogTitle>
          </DialogHeader>

          {!result ? (
            <div className="space-y-4 py-4">
              <p className="text-center text-lg">
                <strong>{displayDate}</strong>の集計実行を
                <br />
                実施してよろしいですか？
              </p>
              <p className="text-center text-sm text-muted-foreground">
                予約表のデータを元に、顧客の来院回数・累計売上・
                <br />
                日報データを更新します。
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <p className="text-center text-sm text-green-600 font-medium">
                {displayDate}の集計が完了しました
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold">
                    {result.completedAppointments}
                  </div>
                  <div className="text-xs text-muted-foreground">施術完了</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    ¥{result.totalSales.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">売上合計</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {result.newCustomers}名
                  </div>
                  <div className="text-xs text-muted-foreground">新規</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold">
                    {result.existingCustomers}名
                  </div>
                  <div className="text-xs text-muted-foreground">既存</div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!result ? (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  キャンセル
                </Button>
                <Button onClick={handleRun} disabled={running}>
                  {running ? "集計中..." : "集計を実行する"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setOpen(false)}>閉じる</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
