"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { submitPublicBooking } from "../actions/bookingLinkActions";
import { timeToMinutes, minutesToTime } from "@/helper/utils/time";

interface PublicBookingFormProps {
  link: {
    slug: string;
    title: string;
    staff_mode: number;
    require_cancel_policy: boolean;
    cancel_policy_text: string | null;
    show_line_button: boolean;
    line_button_text: string | null;
    line_button_url: string | null;
  };
  shopId: number;
  menus: Array<{
    menu_manage_id: string;
    name: string;
    price: number;
    duration: number;
  }>;
  staffs: Array<{ id: number; name: string }>;
  utmSource: string | null;
}

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 9; h < 21; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

export function PublicBookingForm({
  link,
  shopId,
  menus,
  staffs,
  utmSource,
}: PublicBookingFormProps) {
  const [selectedMenuId, setSelectedMenuId] = useState<string>(
    menus[0]?.menu_manage_id ?? ""
  );
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cancelPolicyAccepted, setCancelPolicyAccepted] = useState(
    !link.require_cancel_policy
  );
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const selectedMenu = menus.find((m) => m.menu_manage_id === selectedMenuId);

  async function handleSubmit() {
    if (!selectedMenuId) {
      toast.error("メニューを選択してください");
      return;
    }
    if (!date) {
      toast.error("日付を選択してください");
      return;
    }
    if (!lastName.trim()) {
      toast.error("氏名を入力してください");
      return;
    }
    if (!phone.trim()) {
      toast.error("電話番号を入力してください");
      return;
    }
    if (link.require_cancel_policy && !cancelPolicyAccepted) {
      toast.error("キャンセルポリシーに同意してください");
      return;
    }
    if (link.staff_mode === 0 && !selectedStaffId) {
      toast.error("スタッフを選択してください");
      return;
    }

    setSubmitting(true);

    const duration = selectedMenu?.duration ?? 60;
    const startAt = `${date}T${time}:00`;
    const endTime = minutesToTime(timeToMinutes(time) + duration);
    const endAt = `${date}T${endTime}:00`;

    const form = new FormData();
    form.set("slug", link.slug);
    form.set("shop_id", String(shopId));
    form.set("menu_manage_id", selectedMenuId);
    if (selectedStaffId) form.set("staff_id", String(selectedStaffId));
    form.set("start_at", startAt);
    form.set("end_at", endAt);
    form.set("last_name", lastName);
    form.set("first_name", firstName);
    form.set("phone", phone);
    form.set("email", email);
    if (utmSource) form.set("utm_source", utmSource);

    const result = await submitPublicBooking(form);
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
          <h2 className="text-xl font-bold">ご予約ありがとうございます</h2>
          <p className="text-center text-sm text-gray-600">
            {date} {time} のご予約を承りました。
            <br />
            確認のご連絡をお待ちください。
          </p>
          {link.show_line_button && link.line_button_url && (
            <a
              href={link.line_button_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 rounded-full bg-green-500 px-6 py-3 text-sm font-bold text-white hover:bg-green-600"
            >
              {link.line_button_text || "LINEで相談する"}
            </a>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Menu */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label className="text-sm font-bold">メニュー選択</Label>
          {menus.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              このリンクにはメニューが設定されていません。
            </p>
          ) : (
            <div className="space-y-2">
              {menus.map((m) => (
                <label
                  key={m.menu_manage_id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border-2 px-4 py-3 transition-colors ${
                    selectedMenuId === m.menu_manage_id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={selectedMenuId === m.menu_manage_id}
                      onChange={() => setSelectedMenuId(m.menu_manage_id)}
                    />
                    <div>
                      <div className="font-bold">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.duration}分</div>
                    </div>
                  </div>
                  <div className="font-bold text-blue-600">
                    ¥{m.price.toLocaleString()}
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff (if applicable) */}
      {link.staff_mode !== 2 && staffs.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label className="text-sm font-bold">
              担当スタッフ{link.staff_mode === 1 && "（お任せ可）"}
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {link.staff_mode === 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedStaffId(null)}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-medium ${
                    selectedStaffId === null
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  お任せ
                </button>
              )}
              {staffs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStaffId(s.id)}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-medium ${
                    selectedStaffId === s.id
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date & Time */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label className="text-sm font-bold">日時</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">日付</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">時間</Label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer info */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label className="text-sm font-bold">お客様情報</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                姓 <span className="text-red-500">*</span>
              </Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="山田"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">名</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="太郎"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              電話番号 <span className="text-red-500">*</span>
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09012345678"
              maxLength={11}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">メールアドレス（任意）</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Cancel policy */}
      {link.require_cancel_policy && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label className="text-sm font-bold">キャンセルポリシー</Label>
            <Textarea
              value={link.cancel_policy_text ?? ""}
              readOnly
              rows={4}
              className="bg-gray-50 text-xs"
            />
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={cancelPolicyAccepted}
                onChange={(e) => setCancelPolicyAccepted(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                キャンセルポリシーに同意します
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <Button
        size="lg"
        className="w-full text-base font-bold"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? "送信中..." : "この内容で予約する"}
      </Button>

      {utmSource && (
        <p className="text-center text-[10px] text-gray-400">
          流入元: {utmSource}
        </p>
      )}
    </div>
  );
}
