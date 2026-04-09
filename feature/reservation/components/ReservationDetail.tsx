"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  updateAppointment,
  cancelAppointment,
} from "../actions/reservationActions";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
} from "../types";
import { toast } from "sonner";
import Link from "next/link";

interface ReservationDetailProps {
  appointment: {
    id: number;
    brand_id: number;
    shop_id: number;
    customer_id: number;
    staff_id: number;
    menu_manage_id: string;
    code: string;
    type: number;
    start_at: string;
    end_at: string;
    memo: string | null;
    customer_record: string | null;
    sales: number;
    status: number;
    customers?: { id: number; code: string; last_name: string | null; first_name: string | null } | null;
    staffs?: { id: number; name: string } | null;
  };
}

export function ReservationDetail({ appointment }: ReservationDetailProps) {
  const [status, setStatus] = useState(appointment.status);
  const [memo, setMemo] = useState(appointment.memo ?? "");
  const [customerRecord, setCustomerRecord] = useState(
    appointment.customer_record ?? ""
  );
  const [sales, setSales] = useState(appointment.sales);
  const [saving, setSaving] = useState(false);

  const customer = appointment.customers;
  const staff = appointment.staffs;

  const startDate = appointment.start_at.slice(0, 10);
  const startTime = appointment.start_at.slice(11, 16);
  const endTime = appointment.end_at.slice(11, 16);

  async function handleSave() {
    setSaving(true);
    const formData = new FormData();
    formData.set("status", String(status));
    formData.set("memo", memo);
    formData.set("customer_record", customerRecord);
    formData.set("sales", String(sales));

    const result = await updateAppointment(appointment.id, formData);
    setSaving(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("予約を更新しました");
    }
  }

  async function handleCancel() {
    if (!confirm("この予約をキャンセルしますか？")) return;
    const result = await cancelAppointment(appointment.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("予約をキャンセルしました");
    }
  }

  const statusColor =
    APPOINTMENT_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Appointment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>予約情報</span>
            <Badge className={statusColor}>
              {APPOINTMENT_STATUS_LABELS[appointment.status] ?? "不明"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">予約コード</span>
              <p className="font-mono">{appointment.code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">日時</span>
              <p className="font-medium">
                {startDate} {startTime}-{endTime}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">顧客</span>
              <p>
                {customer ? (
                  <Link
                    href={`/customer/${customer.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {customer.last_name}
                    {customer.first_name} ({customer.code})
                  </Link>
                ) : (
                  `ID: ${appointment.customer_id}`
                )}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">スタッフ</span>
              <p>{staff?.name ?? `ID: ${appointment.staff_id}`}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
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

            <div className="space-y-2">
              <Label>売上金額</Label>
              <Input
                type="number"
                value={sales}
                onChange={(e) => setSales(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>メモ</Label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "保存中..." : "更新"}
            </Button>
            {appointment.status !== 3 && (
              <Button variant="destructive" onClick={handleCancel}>
                キャンセル
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer Record (Carte) */}
      <Card>
        <CardHeader>
          <CardTitle>カルテ</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={customerRecord}
            onChange={(e) => setCustomerRecord(e.target.value)}
            rows={12}
            placeholder="施術内容、患者の状態、次回の注意点など..."
          />
          <Button onClick={handleSave} disabled={saving} className="mt-4">
            カルテを保存
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
