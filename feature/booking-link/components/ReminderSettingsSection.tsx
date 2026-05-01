"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Mail, MessageSquare } from "lucide-react";
import type { ReminderSetting } from "../types";

interface ReminderSettingsSectionProps {
  value: ReminderSetting[];
  onChange: (next: ReminderSetting[]) => void;
}

const DEFAULT_EMAIL_SUBJECT = "【{shop_name}】ご予約のお知らせ";
const DEFAULT_EMAIL_TEMPLATE = `{customer_name} 様

{shop_name} です。
{offset_days}日前のリマインドをお送りいたします。

──────────────
日時: {date} {time}
メニュー: {menu}
担当: {staff}
──────────────

ご来店お待ちしております。
ご不明な点がございましたらお気軽にお問い合わせください。`;

const DEFAULT_SMS_TEMPLATE = `【{shop_name}】{customer_name}様 {offset_days}日前のリマインドです。{date} {time} {menu}。お待ちしております。`;

const DEFAULT_LINE_TEMPLATE = `{customer_name} 様
{offset_days}日前のリマインドです🕐

📅 {date} {time}
💆 {menu}
👤 {staff}

{shop_name}`;

function createDefaultSetting(
  type: ReminderSetting["type"],
  offsetDays = 3
): ReminderSetting {
  const base = {
    offset_days: offsetDays,
    send_time: "08:00",
    enabled: true,
  };
  if (type === "email") {
    return {
      type: "email",
      ...base,
      subject: DEFAULT_EMAIL_SUBJECT,
      template: DEFAULT_EMAIL_TEMPLATE,
    };
  }
  if (type === "sms") {
    return {
      type: "sms",
      ...base,
      template: DEFAULT_SMS_TEMPLATE,
    };
  }
  return {
    type: "line",
    ...base,
    template: DEFAULT_LINE_TEMPLATE,
  };
}

/**
 * クイック追加プリセット (offset_days 値 + ラベル)。
 * いずれも「予約開始時刻の N 日前」のリマインドを意味する。
 */
const QUICK_PRESETS: { offsetDays: number; label: string }[] = [
  { offsetDays: 7, label: "1週間前" },
  { offsetDays: 3, label: "3日前" },
  { offsetDays: 1, label: "前日" },
  { offsetDays: 0, label: "当日" },
];

const TYPE_ICONS: Record<ReminderSetting["type"], React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  line: <span className="text-xs font-bold">L</span>,
};

export function ReminderSettingsSection({
  value,
  onChange,
}: ReminderSettingsSectionProps) {
  function addSetting(type: ReminderSetting["type"], offsetDays = 3) {
    onChange([...value, createDefaultSetting(type, offsetDays)]);
  }

  function addAllChannelsAt(offsetDays: number) {
    // LINE + Email を同時追加。SMS は別途必要なら手動で追加。
    onChange([
      ...value,
      createDefaultSetting("line", offsetDays),
      createDefaultSetting("email", offsetDays),
    ]);
  }

  function updateSetting(index: number, patch: Partial<ReminderSetting>) {
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function removeSetting(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const emailSettings = value
    .map((v, i) => ({ ...v, _i: i }))
    .filter((v) => v.type === "email");
  const smsSettings = value
    .map((v, i) => ({ ...v, _i: i }))
    .filter((v) => v.type === "sms");
  const lineSettings = value
    .map((v, i) => ({ ...v, _i: i }))
    .filter((v) => v.type === "line");

  return (
    <div className="space-y-6">
      {/* クイック追加: よく使うタイミングを 1 タップで追加 */}
      <div className="space-y-2 rounded-md border border-blue-100 bg-blue-50/30 p-3">
        <div className="text-xs font-bold text-blue-800">
          クイック追加 (LINE + メール 同時追加)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PRESETS.map((p) => (
            <Button
              key={p.offsetDays}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => addAllChannelsAt(p.offsetDays)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {p.label}
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-gray-500">
          タップすると「予約日の N 日前 朝 8:00」の LINE + メール リマインドが
          追加されます。LINE が紐付いていない顧客はメールにフォールバックされます。
          時刻 / 文面は下のリマインド一覧から個別に調整できます。
        </p>
      </div>

      <ReminderGroup
        label="リマインドメール"
        type="email"
        settings={emailSettings}
        onUpdate={updateSetting}
        onRemove={removeSetting}
        onAdd={() => addSetting("email")}
      />
      <ReminderGroup
        label="リマインドSMS"
        type="sms"
        settings={smsSettings}
        onUpdate={updateSetting}
        onRemove={removeSetting}
        onAdd={() => addSetting("sms")}
      />
      <ReminderGroup
        label="リマインドLINE"
        type="line"
        settings={lineSettings}
        onUpdate={updateSetting}
        onRemove={removeSetting}
        onAdd={() => addSetting("line")}
      />

      <p className="text-[11px] text-muted-foreground">
        ※ 使用可能な置換変数: <code>{"{customer_name}"}</code>,{" "}
        <code>{"{shop_name}"}</code>, <code>{"{date}"}</code>,{" "}
        <code>{"{time}"}</code>, <code>{"{menu}"}</code>,{" "}
        <code>{"{staff}"}</code>, <code>{"{offset_days}"}</code>
      </p>
    </div>
  );
}

function ReminderGroup({
  label,
  type,
  settings,
  onUpdate,
  onRemove,
  onAdd,
}: {
  label: string;
  type: ReminderSetting["type"];
  settings: Array<ReminderSetting & { _i: number }>;
  onUpdate: (index: number, patch: Partial<ReminderSetting>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">{TYPE_ICONS[type]}</span>
        <Label className="text-sm font-bold">{label}</Label>
      </div>
      {settings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          タイミングが設定されていません
        </p>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => (
            <ReminderRow
              key={s._i}
              setting={s}
              onUpdate={(patch) => onUpdate(s._i, patch)}
              onRemove={() => onRemove(s._i)}
            />
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="mt-1"
      >
        <Plus className="mr-1 h-3 w-3" />
        タイミングを追加する
      </Button>
    </div>
  );
}

function ReminderRow({
  setting,
  onUpdate,
  onRemove,
}: {
  setting: ReminderSetting;
  onUpdate: (patch: Partial<ReminderSetting>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50/40 p-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={setting.enabled}
            onCheckedChange={(v) => onUpdate({ enabled: v })}
          />
          <span className="text-xs">
            {setting.enabled ? "必要" : "不要"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={30}
            value={setting.offset_days}
            onChange={(e) =>
              onUpdate({ offset_days: Number(e.target.value) })
            }
            className="h-8 w-14 text-xs"
          />
          <span className="text-xs text-gray-600">日前</span>
        </div>

        <div className="flex items-center gap-1">
          <Input
            type="time"
            value={setting.send_time}
            onChange={(e) => onUpdate({ send_time: e.target.value })}
            className="h-8 w-24 text-xs"
          />
          <span className="text-xs text-gray-600">に送信</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="ml-auto"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {setting.type === "email" && (
        <div className="space-y-1">
          <Label className="text-[11px] text-gray-500">件名</Label>
          <Input
            value={setting.subject ?? ""}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            placeholder="【{shop_name}】ご予約のお知らせ"
            className="h-8 text-xs"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[11px] text-gray-500">本文テンプレート</Label>
        <Textarea
          value={setting.template}
          onChange={(e) => onUpdate({ template: e.target.value })}
          rows={setting.type === "email" ? 6 : 3}
          className="text-xs"
          placeholder="ご予約のリマインドメッセージ..."
        />
      </div>
    </div>
  );
}
