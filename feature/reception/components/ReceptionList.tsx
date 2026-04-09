"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  UserCheck,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  checkinAppointment,
  completeAppointment,
  noShowAppointment,
} from "../actions/receptionActions";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
} from "@/feature/reservation/types";
import { toast } from "sonner";

interface AppointmentRow {
  id: number;
  start_at: string;
  end_at: string;
  status: number;
  sales: number;
  menu_manage_id: string;
  cancelled_at: string | null;
  customers: {
    id: number;
    code: string;
    last_name: string | null;
    first_name: string | null;
    phone_number_1: string | null;
  } | null;
  staffs: {
    id: number;
    name: string;
  } | null;
}

interface ReceptionListProps {
  appointments: AppointmentRow[];
}

export function ReceptionList({ appointments }: ReceptionListProps) {
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [salesAmount, setSalesAmount] = useState("");

  // Group by status
  const waiting = appointments.filter(
    (a) => a.status === 0 && !a.cancelled_at
  );
  const checkedIn = appointments.filter((a) => a.status === 1);
  const completed = appointments.filter((a) => a.status === 2);
  const cancelled = appointments.filter(
    (a) => a.status === 3 || a.cancelled_at
  );

  async function handleCheckin(id: number) {
    const result = await checkinAppointment(id);
    if (result.error) toast.error(result.error);
    else toast.success("チェックインしました");
  }

  async function handleComplete() {
    if (!selectedId) return;
    const amount = Number(salesAmount) || 0;
    const result = await completeAppointment(selectedId, amount);
    if (result.error) toast.error(result.error);
    else toast.success("施術完了しました");
    setSalesDialogOpen(false);
    setSelectedId(null);
    setSalesAmount("");
  }

  async function handleNoShow(id: number) {
    if (!confirm("無断キャンセルとして記録しますか？")) return;
    const result = await noShowAppointment(id);
    if (result.error) toast.error(result.error);
    else toast.success("無断キャンセルとして記録しました");
  }

  function openCompleteDialog(id: number, currentSales: number) {
    setSelectedId(id);
    setSalesAmount(String(currentSales || ""));
    setSalesDialogOpen(true);
  }

  function renderRow(appt: AppointmentRow) {
    const startTime = appt.start_at.slice(11, 16);
    const endTime = appt.end_at.slice(11, 16);
    const customer = appt.customers;
    const staff = appt.staffs;
    const statusColor =
      APPOINTMENT_STATUS_COLORS[appt.status] ?? "bg-gray-100 text-gray-800";

    return (
      <Card key={appt.id} className="mb-2">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-lg font-bold">{startTime}</div>
              <div className="text-xs text-muted-foreground">{endTime}</div>
            </div>
            <div>
              <div className="font-medium">
                {customer
                  ? `${customer.last_name ?? ""}${customer.first_name ?? ""}`
                  : "不明"}
              </div>
              <div className="text-sm text-muted-foreground">
                担当: {staff?.name ?? "-"}
              </div>
            </div>
            <Badge className={statusColor}>
              {APPOINTMENT_STATUS_LABELS[appt.status] ?? "不明"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {appt.status === 0 && !appt.cancelled_at && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleCheckin(appt.id)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <UserCheck className="mr-1 h-4 w-4" />
                  来店
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNoShow(appt.id)}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  無断
                </Button>
              </>
            )}
            {appt.status === 1 && (
              <Button
                size="sm"
                onClick={() => openCompleteDialog(appt.id, appt.sales)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <CheckCircle className="mr-1 h-4 w-4" />
                完了
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
            {appt.status === 2 && appt.sales > 0 && (
              <span className="text-sm font-medium">
                ¥{appt.sales.toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Waiting */}
      {waiting.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-500">
            <Clock className="h-4 w-4" />
            予約済（{waiting.length}件）
          </h3>
          {waiting.map(renderRow)}
        </section>
      )}

      {/* Checked In */}
      {checkedIn.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-600">
            <UserCheck className="h-4 w-4" />
            来店中（{checkedIn.length}件）
          </h3>
          {checkedIn.map(renderRow)}
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600">
            <CheckCircle className="h-4 w-4" />
            完了（{completed.length}件）
          </h3>
          {completed.map(renderRow)}
        </section>
      )}

      {/* Cancelled */}
      {cancelled.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-500">
            <XCircle className="h-4 w-4" />
            キャンセル/無断（{cancelled.length}件）
          </h3>
          {cancelled.map(renderRow)}
        </section>
      )}

      {appointments.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          本日の予約はありません
        </div>
      )}

      {/* Sales Amount Dialog */}
      <Dialog open={salesDialogOpen} onOpenChange={setSalesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>施術完了 - 売上入力</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>売上金額（税込）</Label>
              <Input
                type="number"
                value={salesAmount}
                onChange={(e) => setSalesAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSalesDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button onClick={handleComplete}>完了として記録</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
