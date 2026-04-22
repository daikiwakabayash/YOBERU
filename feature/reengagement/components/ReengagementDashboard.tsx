"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Mail, MessageCircle, AlertCircle, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_SEGMENTS,
  SEGMENT_DESCRIPTIONS,
  SEGMENT_LABELS,
  type ReengagementSegment,
  type ReengagementTemplate,
  type SegmentCustomer,
} from "../types";
import {
  saveReengagementTemplate,
  sendReengagementCampaign,
} from "../actions/reengagementActions";

interface CouponMenu {
  menu_manage_id: string;
  name: string;
  price: number;
  ticket_count: number;
}

interface ReengagementDashboardProps {
  brandId: number;
  shopId: number;
  templates: Record<ReengagementSegment, ReengagementTemplate>;
  segmentCustomers: Record<ReengagementSegment, SegmentCustomer[]>;
  couponMenus: CouponMenu[];
}

export function ReengagementDashboard({
  brandId,
  shopId,
  templates,
  segmentCustomers,
  couponMenus,
}: ReengagementDashboardProps) {
  const [active, setActive] = useState<ReengagementSegment>("first_visit_30d");

  return (
    <div className="space-y-6">
      {/* セグメントサマリーカード */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {ALL_SEGMENTS.map((seg) => {
          const customers = segmentCustomers[seg];
          const eligible = customers.filter((c) => !c.lastSentAt).length;
          return (
            <button
              key={seg}
              type="button"
              onClick={() => setActive(seg)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active === seg
                  ? "border-emerald-400 bg-emerald-50/50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="text-xs font-bold text-gray-600">
                {SEGMENT_LABELS[seg]}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black text-gray-900">
                  {customers.length}
                </span>
                <span className="text-xs text-gray-500">名</span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                配信可能: {eligible}名 / Cooldown 中: {customers.length - eligible}名
              </div>
            </button>
          );
        })}
      </div>

      {/* タブで選択中のセグメントを操作 */}
      <Tabs
        value={active}
        onValueChange={(v) => {
          if (v) setActive(v as ReengagementSegment);
        }}
      >
        <TabsList>
          {ALL_SEGMENTS.map((seg) => (
            <TabsTrigger key={seg} value={seg}>
              {SEGMENT_LABELS[seg]}
            </TabsTrigger>
          ))}
        </TabsList>

        {ALL_SEGMENTS.map((seg) => (
          <TabsContent key={seg} value={seg} className="space-y-4">
            <p className="text-xs text-gray-500">
              {SEGMENT_DESCRIPTIONS[seg]}
            </p>

            <SegmentPanel
              brandId={brandId}
              shopId={shopId}
              segment={seg}
              template={templates[seg]}
              customers={segmentCustomers[seg]}
              couponMenus={couponMenus}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentPanel: テンプレ編集 + 対象顧客リスト + 配信ボタン
// ---------------------------------------------------------------------------

interface SegmentPanelProps {
  brandId: number;
  shopId: number;
  segment: ReengagementSegment;
  template: ReengagementTemplate;
  customers: SegmentCustomer[];
  couponMenus: CouponMenu[];
}

function SegmentPanel({
  brandId,
  shopId,
  segment,
  template,
  customers,
  couponMenus,
}: SegmentPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(template.title);
  const [message, setMessage] = useState(template.message);
  const [couponMenuId, setCouponMenuId] = useState<string>(
    template.couponMenuManageId ?? ""
  );
  const [cooldownDays, setCooldownDays] = useState(template.cooldownDays);
  const [autoSendEnabled, setAutoSendEnabled] = useState(
    template.autoSendEnabled
  );

  // 初期選択: cooldown に掛かっていない顧客を全員チェック
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (const c of customers) {
      if (!c.lastSentAt) s.add(c.id);
    }
    return s;
  });

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    const allEligible = customers
      .filter((c) => !c.lastSentAt)
      .map((c) => c.id);
    const allSelected = allEligible.every((id) => selectedIds.has(id));
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allEligible));
  }

  async function handleSaveTemplate() {
    startTransition(async () => {
      const res = await saveReengagementTemplate({
        brandId,
        shopId, // 店舗別テンプレとして保存 (ブランド共通にしたい運用は将来拡張)
        segment,
        title,
        message,
        couponMenuManageId: couponMenuId || null,
        cooldownDays,
        autoSendEnabled,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("テンプレートを保存しました");
      router.refresh();
    });
  }

  async function handleSend() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("配信対象を 1 名以上選択してください");
      return;
    }
    if (
      !confirm(
        `${ids.length} 名に「${SEGMENT_LABELS[segment]}」の再来店促進メッセージを送信します。よろしいですか?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await sendReengagementCampaign({
        brandId,
        shopId,
        segment,
        customerIds: ids,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const parts = [`${res.sent} 件送信`];
      if (res.failed > 0) parts.push(`失敗 ${res.failed} 件`);
      if (res.skippedCooldown > 0)
        parts.push(`Cooldown ${res.skippedCooldown} 件`);
      if (res.skippedNoContact > 0)
        parts.push(`連絡先なし ${res.skippedNoContact} 件`);
      if (res.couponsIssued > 0)
        parts.push(`クーポン ${res.couponsIssued} 枚発行`);
      toast.success(parts.join(" / "));
      router.refresh();
    });
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* 左: テンプレ編集 (2/5) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">配信テンプレート</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>タイトル (管理用)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>本文 (改行可)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-gray-500">
              置換変数: {"{customer_name}"} / {"{shop_name}"} / {"{coupon_name}"}
            </p>
          </div>

          <div className="space-y-1">
            <Label>付与クーポン (任意)</Label>
            <Select
              value={couponMenuId || "none"}
              onValueChange={(v) => {
                if (v == null) return;
                setCouponMenuId(v === "none" ? "" : v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="クーポン無し" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">クーポンを付与しない</SelectItem>
                {couponMenus.map((m) => (
                  <SelectItem key={m.menu_manage_id} value={m.menu_manage_id}>
                    {m.name} (¥{m.price.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-500">
              プラン区分 = チケットのメニューから選択。配信時に自動で
              1 枚発行し、お会計で消化できます。
            </p>
          </div>

          <div className="space-y-1">
            <Label>Cooldown (日数)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={cooldownDays}
              onChange={(e) =>
                setCooldownDays(Math.max(1, Number(e.target.value) || 30))
              }
            />
            <p className="text-[10px] text-gray-500">
              同じ顧客に同じセグメントで再送信するまでの最低日数。
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
            <Switch
              checked={autoSendEnabled}
              onCheckedChange={setAutoSendEnabled}
            />
            <div className="flex-1 text-xs">
              <div className="font-bold text-gray-900">自動配信</div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                ON にすると毎日 9:00 (JST) に対象顧客へ自動送信します。
                手動配信ボタンは引き続き利用できます。
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleSaveTemplate}
            disabled={pending}
            className="w-full"
          >
            テンプレートを保存
          </Button>
        </CardContent>
      </Card>

      {/* 右: 対象顧客リスト + 配信ボタン (3/5) */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>配信対象 ({customers.length} 名)</span>
            <Button size="sm" variant="outline" onClick={toggleAll}>
              全選択 / 解除
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              該当する顧客はいません
            </p>
          ) : (
            <div className="max-h-[500px] space-y-1 overflow-y-auto">
              {customers.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  checked={selectedIds.has(c.id)}
                  onToggle={() => toggle(c.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 下: 配信フッター */}
      <div className="lg:col-span-5">
        <div className="flex items-center justify-between rounded-lg border bg-white p-4">
          <div className="text-sm text-gray-700">
            <span className="font-bold text-gray-900">{selectedCount}</span>{" "}
            名に送信します
          </div>
          <Button
            onClick={handleSend}
            disabled={pending || selectedCount === 0}
            className="min-w-[160px]"
          >
            <Send className="mr-1 h-4 w-4" />
            {pending ? "送信中..." : "一斉配信"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomerRow({
  customer,
  checked,
  onToggle,
}: {
  customer: SegmentCustomer;
  checked: boolean;
  onToggle: () => void;
}) {
  const cooldown = !!customer.lastSentAt;
  const channel = customer.lineUserId
    ? "line"
    : customer.email
      ? "email"
      : "none";

  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
        cooldown
          ? "border-gray-100 bg-gray-50/50 opacity-60"
          : checked
            ? "border-emerald-200 bg-emerald-50/50"
            : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <Checkbox
        checked={checked}
        disabled={cooldown || channel === "none"}
        onCheckedChange={() => onToggle()}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900">{customer.name}</span>
          {customer.code && (
            <span className="text-[10px] text-gray-400">
              #{customer.code}
            </span>
          )}
        </div>
        {customer.note && (
          <div className="text-[11px] text-gray-500">{customer.note}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {channel === "line" && (
          <Badge className="bg-emerald-100 text-[10px] text-emerald-700">
            <MessageCircle className="mr-0.5 h-3 w-3" />
            LINE
          </Badge>
        )}
        {channel === "email" && (
          <Badge className="bg-blue-100 text-[10px] text-blue-700">
            <Mail className="mr-0.5 h-3 w-3" />
            メール
          </Badge>
        )}
        {channel === "none" && (
          <Badge className="bg-red-100 text-[10px] text-red-600">
            <AlertCircle className="mr-0.5 h-3 w-3" />
            連絡先なし
          </Badge>
        )}
        {cooldown && (
          <Badge className="bg-gray-100 text-[10px] text-gray-500">
            <CheckCircle2 className="mr-0.5 h-3 w-3" />
            送信済
          </Badge>
        )}
      </div>
    </label>
  );
}
