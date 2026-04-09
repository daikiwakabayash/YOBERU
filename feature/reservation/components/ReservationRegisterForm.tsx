"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight } from "lucide-react";
import { createAppointment } from "../actions/reservationActions";
import { toast } from "sonner";

interface MenuItem {
  id: number;
  menu_manage_id: string;
  name: string;
  price: number;
  duration: number;
}

interface AvailableSlot {
  staffId: number;
  staffName: string;
  startTime: string;
  endTime: string;
}

interface ReservationRegisterFormProps {
  brandId: number;
  shopId: number;
  frameMin: number;
  menus: MenuItem[];
  initialStaffId?: number;
  initialDate?: string;
  initialTime?: string;
}

type Step = 1 | 2 | 3 | 4;

export function ReservationRegisterForm({
  brandId,
  shopId,
  menus,
  initialStaffId,
  initialDate,
  initialTime,
}: ReservationRegisterFormProps) {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    initialDate || new Date().toISOString().split("T")[0]
  );
  const [memo, setMemo] = useState("");

  // Placeholder available slots (would be fetched from getAvailableSlots)
  const [availableSlots] = useState<AvailableSlot[]>([]);

  // Step indicators
  const steps = [
    { num: 1, label: "顧客選択" },
    { num: 2, label: "メニュー選択" },
    { num: 3, label: "日時選択" },
    { num: 4, label: "確認" },
  ];

  async function handleSubmit() {
    if (!customerId || !selectedMenu || !selectedSlot) return;
    setSubmitting(true);

    const startAt = `${selectedDate}T${selectedSlot.startTime}:00`;
    const endAt = `${selectedDate}T${selectedSlot.endTime}:00`;

    const formData = new FormData();
    formData.set("brand_id", String(brandId));
    formData.set("shop_id", String(shopId));
    formData.set("customer_id", String(customerId));
    formData.set("staff_id", String(selectedSlot.staffId));
    formData.set("menu_manage_id", selectedMenu.menu_manage_id);
    formData.set("type", "0");
    formData.set("start_at", startAt);
    formData.set("end_at", endAt);
    formData.set("memo", memo);
    formData.set("is_couple", "false");
    formData.set("sales", String(selectedMenu.price));
    formData.set("status", "0");

    const result = await createAppointment(formData);
    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "予約の作成に失敗しました"
      );
    } else {
      toast.success("予約を登録しました");
      window.location.href = "/reservation";
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <button
              onClick={() => s.num < step && setStep(s.num as Step)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
                s.num === step
                  ? "bg-primary text-primary-foreground"
                  : s.num < step
                    ? "bg-green-100 text-green-800 cursor-pointer"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {s.num < step ? (
                <Check className="h-3 w-3" />
              ) : (
                <span>{s.num}</span>
              )}
              {s.label}
            </button>
            {i < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Customer Selection */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>顧客を選択</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>顧客検索</Label>
              <Input
                placeholder="名前・電話番号・カナで検索..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Supabase 接続後に検索結果が表示されます
              </p>
            </div>

            {/* Temporary manual input */}
            <div className="border-t pt-4 space-y-2">
              <Label>顧客ID（手動入力）</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="顧客ID"
                  onChange={(e) => setCustomerId(Number(e.target.value) || null)}
                />
                <Input
                  placeholder="顧客名"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={() => customerId && setStep(2)}
              disabled={!customerId}
            >
              次へ
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Menu Selection */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>メニューを選択</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {menus.length === 0 ? (
                <p className="text-muted-foreground py-4">
                  メニューが登録されていません
                </p>
              ) : (
                menus.map((menu) => (
                  <button
                    key={menu.id}
                    onClick={() => {
                      setSelectedMenu(menu);
                      setStep(3);
                    }}
                    className={`flex items-center justify-between rounded-lg border p-3 text-left hover:bg-gray-50 transition-colors ${
                      selectedMenu?.id === menu.id
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <div>
                      <div className="font-medium">{menu.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {menu.duration}分
                      </div>
                    </div>
                    <Badge variant="secondary">
                      ¥{menu.price.toLocaleString()}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Date/Time/Staff Selection */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>日時・スタッフを選択</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>日付</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>空き枠</Label>
              {availableSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Supabase 接続後に空き枠が表示されます。
                  <br />
                  手動で選択してください。
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStep(4);
                      }}
                      className={`rounded border p-2 text-sm hover:bg-gray-50 ${
                        selectedSlot === slot
                          ? "border-primary bg-primary/5"
                          : ""
                      }`}
                    >
                      <div className="font-medium">
                        {slot.startTime}-{slot.endTime}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {slot.staffName}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Manual slot input for pre-Supabase */}
            <div className="border-t pt-4 space-y-2">
              <Label>手動入力</Label>
              <div className="flex gap-2">
                <Input
                  type="time"
                  defaultValue={initialTime || ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const duration = selectedMenu?.duration ?? 60;
                      const [h, m] = e.target.value.split(":").map(Number);
                      const endMin = h * 60 + m + duration;
                      const endH = Math.floor(endMin / 60);
                      const endM = endMin % 60;
                      setSelectedSlot({
                        staffId: initialStaffId || 1,
                        staffName: "手動",
                        startTime: e.target.value,
                        endTime: `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`,
                      });
                    }
                  }}
                />
              </div>
            </div>

            <Button
              onClick={() => selectedSlot && setStep(4)}
              disabled={!selectedSlot}
            >
              次へ
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>予約内容の確認</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">顧客</span>
                <span className="font-medium">
                  {customerName || `ID: ${customerId}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">メニュー</span>
                <span className="font-medium">{selectedMenu?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">料金</span>
                <span className="font-medium">
                  ¥{selectedMenu?.price.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">施術時間</span>
                <span className="font-medium">{selectedMenu?.duration}分</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">スタッフ</span>
                <span className="font-medium">{selectedSlot?.staffName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">日時</span>
                <span className="font-medium">
                  {selectedDate} {selectedSlot?.startTime}-
                  {selectedSlot?.endTime}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>メモ</Label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="予約に関するメモ"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? "予約中..." : "予約を確定"}
              </Button>
              <Button variant="outline" onClick={() => setStep(3)}>
                戻る
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
