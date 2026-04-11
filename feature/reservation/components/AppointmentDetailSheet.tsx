"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Search, UserPlus, X, ExternalLink } from "lucide-react";
import type { CalendarAppointment } from "../types";
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  sameDayCancelAppointment,
} from "../actions/reservationActions";
import {
  checkinAppointment,
  completeAppointment,
} from "@/feature/reception/actions/receptionActions";
import { searchCustomers } from "@/feature/customer/services/getCustomers";
import { getLastVisitForCustomer } from "@/feature/reservation/services/getAppointments";
import type { CustomerSummary } from "@/feature/customer/types";
import { timeToMinutes, minutesToTime } from "@/helper/utils/time";
import { toast } from "sonner";

type LastVisit = {
  id: number;
  start_at: string;
  customer_record: string | null;
  menu_manage_id: string | null;
  staffs: { name: string } | null;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AppointmentDetailSheetProps {
  open: boolean;
  onClose: () => void;
  appointment?: CalendarAppointment | null;
  newBooking?: {
    staffId: number;
    staffName: string;
    date: string;
    time: string;
  } | null;
  menus: Array<{
    menu_manage_id: string;
    name: string;
    price: number;
    duration: number;
  }>;
  visitSources: Array<{ id: number; name: string }>;
  paymentMethods?: Array<{ code: string; name: string }>;
  shopId: number;
  brandId: number;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const STATUS_BADGE: Record<number, { label: string; cls: string }> = {
  0: { label: "待機", cls: "border-orange-400 text-orange-600 bg-orange-50" },
  1: { label: "施術中", cls: "border-green-500 text-green-700 bg-green-50" },
  2: { label: "完了", cls: "border-gray-300 text-gray-500 bg-gray-50" },
  3: { label: "キャンセル", cls: "border-red-300 text-red-500 bg-red-50" },
  4: { label: "当日キャンセル", cls: "border-red-400 text-red-700 bg-red-50" },
};

const PLAN_CARDS = [
  { name: "月4回", price: 15400, unit: "月" },
  { name: "月8回", price: 26400, unit: "月" },
  { name: "通い放題", price: 35200, unit: "月" },
] as const;

// ===========================================================================
// Component
// ===========================================================================
export function AppointmentDetailSheet({
  open,
  onClose,
  appointment,
  newBooking,
  menus,
  visitSources,
  paymentMethods,
  shopId,
  brandId,
}: AppointmentDetailSheetProps) {
  const isNew = !appointment;

  // Fallback to built-in list if master data not provided
  const effectivePaymentMethods =
    paymentMethods && paymentMethods.length > 0
      ? paymentMethods
      : [
          { code: "cash", name: "現金" },
          { code: "credit", name: "クレジット" },
          { code: "paypay", name: "PayPay" },
        ];

  // ---- Customer state (new booking) ----
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSummary | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // ---- Previous visit (loaded when an existing customer is selected) ----
  const [lastVisit, setLastVisit] = useState<LastVisit | null>(null);
  const [lastVisitLoading, setLastVisitLoading] = useState(false);

  // For an existing-customer new booking we hide the visit-source picker
  // (the source was captured at first registration) and instead surface the
  // previous visit's chart so the staff can prep without context-switching.
  const isReturningCustomerBooking = isNew && !!selectedCustomer;

  // ---- Status ----
  const [status, setStatus] = useState(appointment?.status ?? 0);

  // ---- Visit source ----
  const [visitSourceId, setVisitSourceId] = useState<number | null>(
    appointment?.visitSourceId ?? null
  );

  // ---- Selected menus ----
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>(() => {
    if (appointment?.menuManageId) return [appointment.menuManageId];
    return [];
  });

  // ---- Carte ----
  const [customerRecord, setCustomerRecord] = useState(
    appointment?.customerRecord ?? ""
  );

  // ---- Membership (marketing 入会率計算の分子) ----
  const [isMemberJoin, setIsMemberJoin] = useState(
    appointment?.isMemberJoin ?? false
  );

  // ---- Customer reviews (G口コミ / H口コミ) ----
  // Persisted on the customer row (not the appointment) so toggling
  // once sticks across every future visit. Loaded lazily when the
  // sheet opens for a known customer.
  const [hasGoogleReview, setHasGoogleReview] = useState(false);
  const [hasHotpepperReview, setHasHotpepperReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState<
    null | "google" | "hotpepper"
  >(null);

  // ---- Billing ----
  const [additionalCharge, setAdditionalCharge] = useState(
    String(appointment?.additionalCharge ?? 0)
  );

  // ---- Payment ----
  const [paymentMethod, setPaymentMethod] = useState<string>(
    appointment?.paymentMethod ?? ""
  );

  // ---- Saving ----
  const [saving, setSaving] = useState(false);

  // ---- Derived ----
  const startTime =
    appointment?.startAt?.slice(11, 16) ?? newBooking?.time ?? "";
  const menuTotal = useMemo(() => {
    return menus
      .filter((m) => selectedMenuIds.includes(m.menu_manage_id))
      .reduce((sum, m) => sum + m.price, 0);
  }, [menus, selectedMenuIds]);

  const total = menuTotal + (Number(additionalCharge) || 0);

  // -----------------------------------------------------------------------
  // Customer search (for new booking)
  // -----------------------------------------------------------------------
  const doCustomerSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setCustomerResults([]);
        setCustomerDropdownOpen(false);
        return;
      }
      setIsSearching(true);
      try {
        const data = await searchCustomers(shopId, q, 8);
        setCustomerResults(data);
        setCustomerDropdownOpen(true);
      } catch {
        setCustomerResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [shopId]
  );

  function handleCustomerQueryChange(value: string) {
    setCustomerQuery(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => doCustomerSearch(value), 300);
  }

  function handleSelectCustomer(c: CustomerSummary) {
    setSelectedCustomer(c);
    setCustomerDropdownOpen(false);
    setCustomerQuery("");
    setIsCreatingCustomer(false);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Resolve the "current" customer id — works for both existing
  // appointments and new bookings where an existing customer was just
  // picked from the search.
  const activeCustomerId =
    appointment?.customerId ?? selectedCustomer?.id ?? null;

  // Load G口コミ / H口コミ receipt status for the active customer.
  // Runs once per customer-id change; the state is stored on the
  // customer row itself so it persists across visits.
  useEffect(() => {
    if (!activeCustomerId) {
      setHasGoogleReview(false);
      setHasHotpepperReview(false);
      return;
    }
    let cancelled = false;
    import("@/feature/customer/actions/customerActions")
      .then((m) => m.getCustomerReviewStatus(activeCustomerId))
      .then((res) => {
        if (cancelled || !res) return;
        setHasGoogleReview(res.hasGoogleReview);
        setHasHotpepperReview(res.hasHotpepperReview);
      })
      .catch(() => {
        /* migration 00009 not run yet — leave defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [activeCustomerId]);

  // Toggle a review checkbox optimistically and persist via server
  // action. Reverts the UI state on error so the user can retry.
  async function handleToggleReview(kind: "google" | "hotpepper") {
    if (!activeCustomerId) {
      toast.error("顧客を選択してから口コミを記録してください");
      return;
    }
    const prev = kind === "google" ? hasGoogleReview : hasHotpepperReview;
    const next = !prev;
    if (kind === "google") setHasGoogleReview(next);
    else setHasHotpepperReview(next);
    setReviewSaving(kind);
    try {
      const { setCustomerReviewStatus } = await import(
        "@/feature/customer/actions/customerActions"
      );
      const res = await setCustomerReviewStatus(activeCustomerId, {
        [kind]: next,
      });
      if ("error" in res) {
        // Revert optimistic update
        if (kind === "google") setHasGoogleReview(prev);
        else setHasHotpepperReview(prev);
        toast.error(res.error);
      } else {
        toast.success(
          next
            ? `${kind === "google" ? "Google" : "HotPepper"}口コミを記録しました`
            : `${kind === "google" ? "Google" : "HotPepper"}口コミを取り消しました`
        );
      }
    } catch {
      if (kind === "google") setHasGoogleReview(prev);
      else setHasHotpepperReview(prev);
      toast.error("保存に失敗しました (migration 00009 未適用の可能性)");
    } finally {
      setReviewSaving(null);
    }
  }

  // Load the previous visit's chart when an existing customer is picked.
  // Cleared if the user removes the selection.
  useEffect(() => {
    if (!isNew || !selectedCustomer) {
      setLastVisit(null);
      return;
    }
    let cancelled = false;
    setLastVisitLoading(true);
    getLastVisitForCustomer(selectedCustomer.id)
      .then((data) => {
        if (!cancelled) setLastVisit(data);
      })
      .catch(() => {
        if (!cancelled) setLastVisit(null);
      })
      .finally(() => {
        if (!cancelled) setLastVisitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, selectedCustomer]);

  // -----------------------------------------------------------------------
  // Menu toggle
  // -----------------------------------------------------------------------
  function toggleMenu(menuId: string) {
    setSelectedMenuIds((prev) =>
      prev.includes(menuId)
        ? prev.filter((id) => id !== menuId)
        : [...prev, menuId]
    );
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  async function handleCheckin() {
    if (!appointment) return;
    const result = await checkinAppointment(appointment.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("来店を記録しました");
      setStatus(1);
    }
  }

  async function handleCancel() {
    if (!appointment) return;
    if (!confirm("この予約をキャンセルしますか？")) return;
    const result = await cancelAppointment(appointment.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("キャンセルしました");
      setStatus(3);
      onClose();
    }
  }

  // -----------------------------------------------------------------------
  // 当日キャンセル: records the cancellation reason in customer_record so
  // future bookings can surface it via getLastVisitForCustomer / 前回カルテ.
  // Skips visit_count + last_visit_date updates (no-show ≠ visit).
  // -----------------------------------------------------------------------
  async function handleSameDayCancel() {
    if (!appointment) return;
    const reason = customerRecord.trim();
    if (!reason) {
      if (
        !confirm(
          "キャンセル理由が未入力です。理由なしで当日キャンセルを記録しますか？"
        )
      ) {
        return;
      }
    } else if (
      !confirm("この予約を当日キャンセルとして記録します。よろしいですか？")
    ) {
      return;
    }

    setSaving(true);
    const result = await sameDayCancelAppointment(appointment.id, reason);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setStatus(4);
    toast.success("当日キャンセルとして記録しました");
    onClose();
  }

  // -----------------------------------------------------------------------
  // Quick save: 一時保存 (名前+電話+メモ+経路のみで予約作成)
  // -----------------------------------------------------------------------
  async function handleQuickSave() {
    if (!newBooking) return;

    if (!isCreatingCustomer && !selectedCustomer) {
      toast.error("顧客を選択または新規作成してください");
      return;
    }
    if (isCreatingCustomer && !newCustomerName.trim()) {
      toast.error("名前を入力してください");
      return;
    }

    setSaving(true);
    try {
      let customerId: number;

      if (isCreatingCustomer) {
        const custForm = new FormData();
        custForm.set("brand_id", String(brandId));
        custForm.set("shop_id", String(shopId));
        const nameParts = newCustomerName.trim().split(/\s+/);
        custForm.set("last_name", nameParts[0] ?? "");
        custForm.set("first_name", nameParts.slice(1).join(" ") || "");
        custForm.set("phone_number_1", newCustomerPhone);
        custForm.set("type", "0");
        custForm.set("gender", "0");

        const { createCustomer } = await import(
          "@/feature/customer/actions/customerActions"
        );
        const custResult = await createCustomer(custForm);
        if ("error" in custResult && custResult.error) {
          toast.error(
            typeof custResult.error === "string"
              ? custResult.error
              : "顧客作成に失敗しました"
          );
          setSaving(false);
          return;
        }
        const matches = await searchCustomers(shopId, newCustomerPhone, 1);
        if (!matches.length) {
          toast.error("顧客の作成後に取得できませんでした");
          setSaving(false);
          return;
        }
        customerId = matches[0].id;
      } else {
        customerId = selectedCustomer!.id;
      }

      // Default menu or first available
      const defaultMenuId = selectedMenuIds[0] || menus[0]?.menu_manage_id || "STR-001";
      const defaultDuration = menus.find(m => m.menu_manage_id === defaultMenuId)?.duration || 60;

      const startAt = `${newBooking.date}T${newBooking.time}:00`;
      const endTime = minutesToTime(
        timeToMinutes(newBooking.time) + defaultDuration
      );
      const endAt = `${newBooking.date}T${endTime}:00`;

      const form = new FormData();
      form.set("brand_id", String(brandId));
      form.set("shop_id", String(shopId));
      form.set("customer_id", String(customerId));
      form.set("staff_id", String(newBooking.staffId));
      form.set("menu_manage_id", defaultMenuId);
      form.set("type", "0");
      form.set("start_at", startAt);
      form.set("end_at", endAt);
      form.set("memo", customerRecord);
      form.set("is_couple", "false");
      form.set("sales", "0");
      form.set("status", "0"); // 待機 status
      if (visitSourceId) {
        form.set("visit_source_id", String(visitSourceId));
      }

      const result = await createAppointment(form);
      if ("error" in result && result.error) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "予約作成に失敗しました"
        );
        setSaving(false);
        return;
      }

      toast.success("予約を一時保存しました");
      onClose();
    } catch (e) {
      toast.error("エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Main submit: 会計を確定する
  // -----------------------------------------------------------------------
  async function handleSubmit() {
    // Validation for new booking
    if (isNew) {
      if (!selectedCustomer && !isCreatingCustomer) {
        toast.error("顧客を選択または新規作成してください");
        return;
      }
      if (isCreatingCustomer && !newCustomerName.trim()) {
        toast.error("顧客名を入力してください");
        return;
      }
      if (isCreatingCustomer && !newCustomerPhone.trim()) {
        toast.error("電話番号を入力してください");
        return;
      }
      // 来店経路 is only required when registering a brand-new customer.
      // For returning customers we trust the source already on file.
      if (isCreatingCustomer && !visitSourceId) {
        toast.error("来店経路を選択してください");
        return;
      }
    }

    if (selectedMenuIds.length === 0) {
      toast.error("メニューを1つ以上選択してください");
      return;
    }

    if (!paymentMethod) {
      toast.error("支払い方法を選択してください");
      return;
    }

    setSaving(true);

    try {
      // --- For new booking: create customer if needed, then create appointment ---
      if (isNew && newBooking) {
        let customerId: number;

        if (isCreatingCustomer) {
          // Create a minimal customer via direct formData
          const custForm = new FormData();
          custForm.set("brand_id", String(brandId));
          custForm.set("shop_id", String(shopId));
          const nameParts = newCustomerName.trim().split(/\s+/);
          custForm.set("last_name", nameParts[0] ?? "");
          custForm.set("first_name", nameParts.slice(1).join(" ") || "");
          custForm.set("phone_number_1", newCustomerPhone);
          custForm.set("type", "0");
          custForm.set("gender", "0");

          const { createCustomer } = await import(
            "@/feature/customer/actions/customerActions"
          );
          const custResult = await createCustomer(custForm);
          if ("error" in custResult && custResult.error) {
            toast.error(
              typeof custResult.error === "string"
                ? custResult.error
                : "顧客作成に失敗しました"
            );
            setSaving(false);
            return;
          }
          // Re-search to get the ID of the newly created customer
          const matches = await searchCustomers(shopId, newCustomerPhone, 1);
          if (!matches.length) {
            toast.error("顧客の作成後に取得できませんでした");
            setSaving(false);
            return;
          }
          customerId = matches[0].id;
        } else {
          customerId = selectedCustomer!.id;
        }

        // Build primary menu duration for end_at
        const primaryMenu = menus.find(
          (m) => m.menu_manage_id === selectedMenuIds[0]
        );
        const totalDuration = menus
          .filter((m) => selectedMenuIds.includes(m.menu_manage_id))
          .reduce((s, m) => s + m.duration, 0);
        const dur = totalDuration || primaryMenu?.duration || 60;

        const startAt = `${newBooking.date}T${newBooking.time}:00`;
        const endTime = minutesToTime(timeToMinutes(newBooking.time) + dur);
        const endAt = `${newBooking.date}T${endTime}:00`;

        const form = new FormData();
        form.set("brand_id", String(brandId));
        form.set("shop_id", String(shopId));
        form.set("customer_id", String(customerId));
        form.set("staff_id", String(newBooking.staffId));
        form.set("menu_manage_id", selectedMenuIds[0]);
        form.set("type", "0");
        form.set("start_at", startAt);
        form.set("end_at", endAt);
        form.set("memo", "");
        form.set("customer_record", customerRecord);
        form.set("is_couple", "false");
        form.set("sales", String(total));
        form.set("status", "2");

        const result = await createAppointment(form);
        if ("error" in result && result.error) {
          toast.error(
            typeof result.error === "string"
              ? result.error
              : "予約作成に失敗しました"
          );
          setSaving(false);
          return;
        }

        toast.success("予約を作成し会計を確定しました");
      } else if (appointment) {
        // --- Existing appointment: complete with billing ---
        const completeResult = await completeAppointment(appointment.id, total);
        if (completeResult.error) {
          toast.error(completeResult.error);
          setSaving(false);
          return;
        }

        // Update additional fields
        const form = new FormData();
        form.set("customer_record", customerRecord);
        form.set("sales", String(total));
        form.set("status", "2");
        form.set("is_member_join", isMemberJoin ? "true" : "false");
        if (visitSourceId) {
          form.set("visit_source_id", String(visitSourceId));
        }
        if (paymentMethod) {
          form.set("payment_method", paymentMethod);
        }
        if (Number(additionalCharge)) {
          form.set("additional_charge", additionalCharge);
        }

        await updateAppointment(appointment.id, form);
        setStatus(2);
        toast.success("会計を確定しました");
      }

      onClose();
    } catch (err) {
      toast.error("エラーが発生しました");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const statusInfo = STATUS_BADGE[status] ?? STATUS_BADGE[0];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[520px] overflow-y-auto p-0 sm:max-w-[520px]"
      >
        {/* ------- Header ------- */}
        <SheetHeader className="sticky top-0 z-10 border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-bold">
              {isNew ? (
                "新規予約"
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/customer/${appointment.customerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-1 font-black text-gray-900 hover:text-blue-600 hover:underline"
                    title="顧客詳細を新しいタブで開く"
                  >
                    {appointment.customerName}
                    <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                  {appointment.customerPhone && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="font-medium text-gray-500">
                        {appointment.customerPhone}
                      </span>
                    </>
                  )}
                  <span className="text-gray-300">|</span>
                  <span className="font-medium text-gray-500">
                    予約{startTime}
                  </span>
                </span>
              )}
            </SheetTitle>
            <Badge
              variant="outline"
              className={`ml-2 shrink-0 text-xs ${statusInfo.cls}`}
            >
              {statusInfo.label}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-6 px-6 py-5">
          {/* ------- Status action buttons (existing) ------- */}
          {!isNew && status === 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCheckin}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                来店（チェックイン）
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                キャンセル
              </Button>
            </div>
          )}

          {/* ===== Section: Customer (new booking only) ===== */}
          {isNew && !selectedCustomer && !isCreatingCustomer && (
            <section className="space-y-3">
              <Label className="text-xs font-bold text-gray-500">
                顧客を検索
              </Label>
              <div ref={searchContainerRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={customerQuery}
                    onChange={(e) => handleCustomerQueryChange(e.target.value)}
                    placeholder="名前・電話番号で検索..."
                    className="pl-9"
                  />
                </div>
                {customerDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
                    {isSearching ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        検索中...
                      </div>
                    ) : customerResults.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        該当する顧客がいません
                      </div>
                    ) : (
                      <ul className="max-h-48 overflow-auto py-1">
                        {customerResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100"
                              onClick={() => handleSelectCustomer(c)}
                            >
                              <span className="font-medium">
                                {[c.last_name, c.first_name]
                                  .filter(Boolean)
                                  .join(" ") || "-"}
                              </span>
                              {c.phone_number_1 && (
                                <span className="text-xs text-muted-foreground">
                                  {c.phone_number_1}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setIsCreatingCustomer(true)}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                新規顧客を作成
              </Button>
            </section>
          )}

          {/* Selected customer badge (new booking) */}
          {isNew && selectedCustomer && (
            <section className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2">
              <Link
                href={`/customer/${selectedCustomer.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1 text-sm font-bold text-gray-900 hover:text-blue-600 hover:underline"
                title="顧客詳細を新しいタブで開く"
              >
                {[selectedCustomer.last_name, selectedCustomer.first_name]
                  .filter(Boolean)
                  .join(" ") || "-"}
                <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
              {selectedCustomer.phone_number_1 && (
                <span className="text-xs text-muted-foreground">
                  {selectedCustomer.phone_number_1}
                </span>
              )}
              <button
                type="button"
                className="ml-auto text-gray-400 hover:text-gray-600"
                onClick={() => setSelectedCustomer(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </section>
          )}

          {/* New customer form */}
          {isNew && isCreatingCustomer && !selectedCustomer && (
            <section className="space-y-3 rounded-lg border bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-gray-500">
                  新規顧客
                </Label>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => setIsCreatingCustomer(false)}
                >
                  戻る
                </button>
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="氏名（姓 名）*"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
                <Input
                  placeholder="電話番号 *"
                  type="tel"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </div>
            </section>
          )}

          {/* ===== Section: Returning customer → 前回カルテ ===== */}
          {isReturningCustomerBooking ? (
            <section className="space-y-2">
              <Label className="text-xs font-bold text-gray-500">
                前回カルテ
              </Label>
              {lastVisitLoading ? (
                <div className="rounded-lg border bg-gray-50 px-3 py-3 text-xs text-muted-foreground">
                  読み込み中...
                </div>
              ) : lastVisit ? (
                (() => {
                  const dateStr = lastVisit.start_at?.slice(0, 10) ?? "";
                  const timeStr = lastVisit.start_at?.slice(11, 16) ?? "";
                  const menuName =
                    menus.find(
                      (m) => m.menu_manage_id === lastVisit.menu_manage_id
                    )?.name ?? lastVisit.menu_manage_id ?? "";
                  return (
                    <div className="space-y-2 rounded-lg border bg-gray-50 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span className="font-bold text-gray-800">
                          {dateStr} {timeStr}
                        </span>
                        {menuName && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span>{menuName}</span>
                          </>
                        )}
                        {lastVisit.staffs?.name && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span>担当 {lastVisit.staffs.name}</span>
                          </>
                        )}
                      </div>
                      {lastVisit.customer_record ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                          {lastVisit.customer_record}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          前回はカルテに記載がありません
                        </p>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-lg border bg-gray-50 px-3 py-3 text-xs text-muted-foreground">
                  過去の来店履歴がありません
                </div>
              )}
            </section>
          ) : (
            <section className="space-y-2">
              <Label className="text-xs font-bold text-gray-500">
                来店経路
                {isNew && <span className="ml-1 text-red-500">*必須</span>}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {visitSources.map((vs) => (
                  <button
                    key={vs.id}
                    type="button"
                    onClick={() =>
                      setVisitSourceId(visitSourceId === vs.id ? null : vs.id)
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      visitSourceId === vs.id
                        ? "border-orange-400 bg-orange-500 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:bg-orange-50"
                    }`}
                  >
                    {vs.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <Separator />

          {/* ===== Section: Menu Selection ===== */}
          <section className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">
              メニュー選択
            </Label>
            <div className="space-y-1">
              {menus.map((menu) => {
                const isSelected = selectedMenuIds.includes(
                  menu.menu_manage_id
                );
                return (
                  <label
                    key={menu.menu_manage_id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      isSelected
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleMenu(menu.menu_manage_id)}
                    />
                    <span className="flex-1 text-sm">
                      {menu.name}（{menu.duration}分）
                    </span>
                    <span className="text-sm font-bold text-gray-700">
                      {menu.price === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-green-300 bg-green-50 text-green-700"
                        >
                          プラン内
                        </Badge>
                      ) : (
                        `¥${menu.price.toLocaleString()}`
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* ===== Section: Carte (カルテ) ===== */}
          <section className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">カルテ</Label>
            <Textarea
              value={customerRecord}
              onChange={(e) => setCustomerRecord(e.target.value)}
              rows={4}
              placeholder="所見・次回への引き継ぎ"
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              患者DBに自動蓄積されます
            </p>
          </section>

          {/* ===== Section: 入会 (マーケティング分析用) ===== */}
          {!isNew && (
            <section className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
              <input
                type="checkbox"
                id="is-member-join"
                checked={isMemberJoin}
                onChange={(e) => setIsMemberJoin(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
              />
              <label
                htmlFor="is-member-join"
                className="flex-1 cursor-pointer text-sm"
              >
                <span className="font-bold text-gray-900">
                  この来店で入会した
                </span>
                <span className="ml-2 text-[11px] text-gray-500">
                  マーケティングの入会率計算に使用
                </span>
              </label>
            </section>
          )}

          <Separator />

          {/* ===== Section: Billing (お会計) ===== */}
          <section className="space-y-3">
            <Label className="text-xs font-bold text-gray-500">お会計</Label>
            <div className="space-y-1 rounded-lg border bg-gray-50 p-3">
              {menus
                .filter((m) => selectedMenuIds.includes(m.menu_manage_id))
                .map((m) => (
                  <div
                    key={m.menu_manage_id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">{m.name}</span>
                    <span className="font-medium">
                      ¥{m.price.toLocaleString()}
                    </span>
                  </div>
                ))}
              {selectedMenuIds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  メニューを選択してください
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-xs text-gray-500">
                追加料金
              </Label>
              <Input
                type="number"
                value={additionalCharge}
                onChange={(e) => setAdditionalCharge(e.target.value)}
                className="h-8 w-32 text-right text-sm"
                placeholder="0"
              />
              <span className="text-xs text-gray-400">円</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2.5 text-white">
              <span className="text-sm font-medium">合計</span>
              <span className="text-lg font-black">
                ¥{total.toLocaleString()}
              </span>
            </div>

            {/* ===== G口コミ / H口コミ checkboxes =====
                Stored on the customer row so once checked, the flag
                survives across every future visit. Fed into the 経営
                指標 ダッシュボードの G口コミ / H口コミ hero cards. */}
            <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
              <div className="text-[11px] font-bold text-emerald-700">
                口コミ受領チェック
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasGoogleReview}
                  disabled={!activeCustomerId || reviewSaving !== null}
                  onChange={() => handleToggleReview("google")}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                />
                <span className="font-bold text-gray-800">G口コミ</span>
                <span className="text-[11px] text-gray-500">
                  Googleレビューを頂いた
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasHotpepperReview}
                  disabled={!activeCustomerId || reviewSaving !== null}
                  onChange={() => handleToggleReview("hotpepper")}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                />
                <span className="font-bold text-gray-800">H口コミ</span>
                <span className="text-[11px] text-gray-500">
                  HotPepperレビューを頂いた
                </span>
              </label>
              {!activeCustomerId && (
                <p className="text-[10px] text-gray-400">
                  顧客を選択すると口コミを記録できます
                </p>
              )}
            </div>
          </section>

          <Separator />

          {/* ===== Section: Plan suggestion ===== */}
          {!isNew && appointment && (
            <section className="space-y-2">
              <Label className="text-xs font-bold text-gray-500">
                プラン提案
              </Label>
              <p className="text-xs text-orange-600">
                プラン未契約 - プランを提案してください
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PLAN_CARDS.map((plan) => (
                  <div
                    key={plan.name}
                    className="cursor-pointer rounded-lg border border-gray-200 p-3 text-center transition-colors hover:border-orange-300 hover:bg-orange-50"
                  >
                    <div className="text-xs font-bold text-gray-700">
                      {plan.name}
                    </div>
                    <div className="mt-1 text-sm font-black text-orange-600">
                      ¥{plan.price.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      /{plan.unit}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isNew && appointment && <Separator />}

          {/* ===== Section: Payment Method ===== */}
          <section className="space-y-2">
            <Label className="text-xs font-bold text-gray-500">
              支払い方法
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {effectivePaymentMethods.map((pm) => (
                <button
                  key={pm.code}
                  type="button"
                  onClick={() => setPaymentMethod(pm.code)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                    paymentMethod === pm.code
                      ? "border-blue-400 bg-blue-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50"
                  }`}
                >
                  {pm.name}
                </button>
              ))}
            </div>
          </section>

          <Separator />

          {/* ===== Quick save button (new booking only) ===== */}
          {isNew && (
            <Button
              size="lg"
              variant="outline"
              className="w-full border-2 border-blue-500 py-5 text-base font-bold text-blue-600 hover:bg-blue-50"
              onClick={handleQuickSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "一時保存（予約のみ登録）"}
            </Button>
          )}

          {/* ===== 当日キャンセル button (existing 待機/施術中 only) ===== */}
          {!isNew && (status === 0 || status === 1) && (
            <Button
              size="lg"
              variant="outline"
              className="w-full border-2 border-red-400 py-5 text-base font-bold text-red-600 hover:bg-red-50"
              onClick={handleSameDayCancel}
              disabled={saving}
            >
              {saving ? "処理中..." : "当日キャンセル"}
            </Button>
          )}

          {/* ===== Submit button ===== */}
          <Button
            size="lg"
            className="w-full bg-orange-500 py-6 text-base font-black hover:bg-orange-600"
            onClick={handleSubmit}
            disabled={saving || status === 2 || status === 3 || status === 4}
          >
            {saving
              ? "処理中..."
              : status === 2
                ? "会計確定済み"
                : status === 4
                  ? "当日キャンセル済み"
                  : "会計を確定する"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
