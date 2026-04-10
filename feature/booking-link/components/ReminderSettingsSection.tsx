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
  type: ReminderSetting["type"]
): ReminderSetting {
  const base = {
    offset_days: 3,
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

const TYPE_ICONS: Record<ReminderSetting["type"], React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  line: <span className="text-xs font-bold">L</span>,
};

export function ReminderSettingsSection({
  value,
  onChange,
}: ReminderSettingsSectionProps) {
  function addSetting(type: ReminderSetting["type"]) {
    onChange([...value, createDefaultSetting(type)]);
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
