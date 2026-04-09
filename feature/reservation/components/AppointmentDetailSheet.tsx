"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  UserCheck,
  CheckCircle,
  XCircle,
  FileText,
  Receipt,
  Clock,
  User,
} from "lucide-react";
import type { CalendarAppointment } from "../types";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
} from "../types";
import {
  updateAppointment,
  cancelAppointment,
} from "../actions/reservationActions";
import {
  checkinAppointment,
  completeAppointment,
} from "@/feature/reception/actions/receptionActions";
import { toast } from "sonner";

interface AppointmentDetailSheetProps {
  appointment?: CalendarAppointment | null;
  open: boolean;
  onClose: () => void;
  newBooking?: {
    staffId: number;
    staffName: string;
    date: string;
    time: string;
  } | null;
  menus?: Array<{ menu_manage_id: string; name: string; price: number; duration: number }>;
  visitSources?: Array<{ id: number; name: string }>;
  shopId?: number;
  brandId?: number;
}

export function AppointmentDetailSheet({
  appointment,
  open,
  onClose,
}: AppointmentDetailSheetProps) {
  const [status, setStatus] = useState(appointment?.status ?? 0);
  const [salesAmount, setSalesAmount] = useState(String(appointment?.sales || ""));
  const [customerRecord, setCustomerRecord] = useState(
    appointment?.customerRecord ?? ""
  );
  const [memo, setMemo] = useState(appointment?.memo ?? "");
  const [saving, setSaving] = useState(false);

  if (!appointment) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-[440px] overflow-y-auto sm:max-w-[440px]">
          <SheetHeader>
            <SheetTitle>新規予約</SheetTitle>
          </SheetHeader>
          <div className="py-8 text-center text-muted-foreground">
            Supabase接続後に予約入力フォームが表示されます
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const appt = appointment;
  const startTime = appt.startAt.slice(11, 16);
  const endTime = appt.endAt.slice(11, 16);
  const startDate = appt.startAt.slice(0, 10);

  const statusColor =
    APPOINTMENT_STATUS_COLORS[appt.status] ?? "bg-gray-100 text-gray-800";

  async function handleCheckin() {
    const result = await checkinAppointment(appt.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("来店を記録しました");
      setStatus(1);
    }
  }

  async function handleComplete() {
    const amount = Number(salesAmount) || 0;
    const result = await completeAppointment(appt.id, amount);
    if (result.error) toast.error(result.error);
    else {
      toast.success("施術完了しました");
      setStatus(2);
    }
  }

  async function handleCancel() {
    if (!confirm("この予約をキャンセルしますか？")) return;
    const result = await cancelAppointment(appt.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("キャンセルしました");
      setStatus(3);
      onClose();
    }
  }

  async function handleSaveRecord() {
    setSaving(true);
    const formData = new FormData();
    formData.set("memo", memo);
    formData.set("customer_record", customerRecord);
    formData.set("sales", salesAmount);
    formData.set("status", String(status));
    const result = await updateAppointment(appt.id, formData);
    setSaving(false);
    if ("error" in result && result.error) toast.error(String(result.error));
    else toast.success("保存しました");
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[440px] overflow-y-auto sm:max-w-[440px]">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <span>{appt.customerName}</span>
            <Badge className={statusColor}>
              {APPOINTMENT_STATUS_LABELS[appt.status] ?? "不明"}
            </Badge>
            {appt.isNewCustomer && (
              <Badge className="bg-emerald-500 text-white">新規</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Summary */}
        <div className="space-y-3 rounded-xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="font-medium">
              {startDate} {startTime} - {endTime}
            </span>
            <span className="text-gray-400">({appt.duration}分)</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <span>{appt.menuName}</span>
          </div>
          {appt.isNewCustomer && appt.source && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">流入経路:</span>
              <Badge variant="outline" className="text-xs">
                {appt.source}
              </Badge>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Action buttons based on status */}
        {status === 0 && (
          <div className="flex gap-2">
            <Button
              onClick={handleCheckin}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <UserCheck className="mr-1 h-4 w-4" />
              来店（チェックイン）
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              <XCircle className="mr-1 h-4 w-4" />
              キャンセル
            </Button>
          </div>
        )}
        {status === 1 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>会計金額（税込）</Label>
              <Input
                type="number"
                value={salesAmount}
                onChange={(e) => setSalesAmount(e.target.value)}
                placeholder="0"
                className="text-lg font-bold"
              />
            </div>
            <Button
              onClick={handleComplete}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <CheckCircle className="mr-1 h-4 w-4" />
              施術完了 + 会計
            </Button>
          </div>
        )}
        {status === 2 && (
          <div className="rounded-lg bg-blue-50 p-3 text-center text-sm text-blue-700">
            完了済み
            {Number(salesAmount) > 0 &&
              ` - ¥${Number(salesAmount).toLocaleString()}`}
          </div>
        )}

        <Separator className="my-4" />

        {/* Tabs: カルテ / メモ / 会計 */}
        <Tabs defaultValue="carte">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="carte" className="text-xs">
              <FileText className="mr-1 h-3 w-3" />
              カルテ
            </TabsTrigger>
            <TabsTrigger value="memo" className="text-xs">
              メモ
            </TabsTrigger>
            <TabsTrigger value="billing" className="text-xs">
              <Receipt className="mr-1 h-3 w-3" />
              会計
            </TabsTrigger>
          </TabsList>

          <TabsContent value="carte" className="space-y-3 pt-3">
            <Textarea
              value={customerRecord}
              onChange={(e) => setCustomerRecord(e.target.value)}
              rows={8}
              placeholder="施術内容、患者の状態、次回の注意点など..."
              className="resize-none"
            />
            <Button
              size="sm"
              onClick={handleSaveRecord}
              disabled={saving}
            >
              {saving ? "保存中..." : "カルテを保存"}
            </Button>
          </TabsContent>

          <TabsContent value="memo" className="space-y-3 pt-3">
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder="予約に関するメモ..."
              className="resize-none"
            />
            <Button
              size="sm"
              onClick={handleSaveRecord}
              disabled={saving}
            >
              {saving ? "保存中..." : "メモを保存"}
            </Button>
          </TabsContent>

          <TabsContent value="billing" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>売上金額</Label>
              <Input
                type="number"
                value={salesAmount}
                onChange={(e) => setSalesAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ステータス</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={status}
                onChange={(e) => setStatus(Number(e.target.value))}
              >
                <option value={0}>予約済</option>
                <option value={1}>来店</option>
                <option value={2}>完了</option>
                <option value={3}>キャンセル</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={handleSaveRecord}
              disabled={saving}
            >
              {saving ? "保存中..." : "会計を保存"}
            </Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
