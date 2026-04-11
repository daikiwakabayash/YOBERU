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
  /**
   * Master-config toggle — when FALSE we hide the ミーティング / その他
   * mode switcher entirely so shops that don't want slot-block bookings
   * see the classic single-mode flow.
   */
  enableMeetingBooking?: boolean;
}

/**
 * Available durations for ミーティング / その他 slot-blocks.
 * Kept short (up to 2h) because those are the real-world use cases
 * reported — day-long blocks go via the calendar's off-shift feature.
 */
const SLOT_BLOCK_DURATIONS = [15, 30, 45, 60, 90, 120] as const;

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
  enableMeetingBooking = true,
}: AppointmentDetailSheetProps) {
  const isNew = !appointment;

  // ---- Existing slot-block detection --------------------------------
  // If we're opening an existing appointment and the calendar service
  // flagged it as a slot block (meeting / other / break / custom), we
  // skip the customer detail flow entirely and render the slot-block
  // editor instead — even though the row already exists.
  const existingSlotBlockCode = appointment?.slotBlock?.code ?? null;
  const isExistingSlotBlock = !!existingSlotBlockCode;

  // ---- Booking mode --------------------------------------------------
  // "regular"  = 通常予約 (default; existing flow)
  // "meeting"  = スタッフ MTG 等、枠だけ抑える
  // "other"    = その他、タイトルと時間を自由入力して枠を抑える
  // "break"    = 休憩
  //
  // Defaults to whatever the existing appointment is (so clicking a
  // meeting on the calendar re-opens the meeting editor), otherwise
  // "regular" for brand-new bookings.
  type BookingMode = "regular" | "meeting" | "other" | "break";
  const [bookingMode, setBookingMode] = useState<BookingMode>(() => {
    if (existingSlotBlockCode === "meeting") return "meeting";
    if (existingSlotBlockCode === "other") return "other";
    if (existingSlotBlockCode === "break") return "break";
    return "regular";
  });
  const [slotBlockDuration, setSlotBlockDuration] = useState<number>(() => {
    if (appointment) {
      const startMin = timeToMinutes(appointment.startAt.slice(11, 16));
      const endMin = timeToMinutes(appointment.endAt.slice(11, 16));
      const dur = endMin - startMin;
      return dur > 0 ? dur : 30;
    }
    return 30;
  });
  const [otherLabel, setOtherLabel] = useState(appointment?.otherLabel ?? "");
  const isSlotBlockMode = bookingMode !== "regular";

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

  // ---- Carte / slot block memo ----
  // For regular appointments this is the カルテ text (customer_record
  // column). For slot blocks (meeting / other / break) we store the
  // note in the memo column instead — so initialize from whichever
  // field has content, favoring memo for slot blocks.
  const [customerRecord, setCustomerRecord] = useState(() => {
    if (!appointment) return "";
    if (appointment.slotBlock) return appointment.memo ?? "";
    return appointment.customerRecord ?? "";
  });

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

  // ---- Full customer dossier for the right-side patient DB panel ----
  // Matches the /customer/:id page shape (basic info + recent history +
  // derived totals). Loaded on-demand whenever the active customer
  // changes so the staff can see who they're on the phone with at a
  // glance.
  type CustomerFullDetail = Awaited<
    ReturnType<
      typeof import("@/feature/customer/services/getCustomers").getCustomerFullDetail
    >
  >;
  const [customerDetail, setCustomerDetail] =
    useState<CustomerFullDetail | null>(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);

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

  // Load the full customer dossier (basic info + recent history +
  // totals) whenever the attached customer changes. Powers the right
  // hand patient DB panel.
  useEffect(() => {
    if (!activeCustomerId) {
      setCustomerDetail(null);
      return;
    }
    let cancelled = false;
    setCustomerDetailLoading(true);
    import("@/feature/customer/services/getCustomers")
      .then((m) => m.getCustomerFullDetail(activeCustomerId))
      .then((res) => {
        if (!cancelled) setCustomerDetail(res);
      })
      .catch(() => {
        if (!cancelled) setCustomerDetail(null);
      })
      .finally(() => {
        if (!cancelled) setCustomerDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCustomerId]);

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
  // Slot-block save: ミーティング / その他
  //
  // These are NOT real treatment appointments — they exist only to
  // block the calendar slot so staff aren't mistakenly double-booked.
  // No customer, no menu, no sales. Marker fields:
  //   type = 1 (meeting) or 2 (other)
  //   menu_manage_id = "SYS-MEETING" / "SYS-OTHER" (satisfies NOT NULL)
  //   other_label = user-entered title (type 2 only)
  // Aggregation services (utilization / marketing / sales) filter on
  // `type != 0` to exclude them.
  // -----------------------------------------------------------------------
  async function handleSaveSlotBlock() {
    if (bookingMode === "other" && !otherLabel.trim()) {
      toast.error("内容を入力してください");
      return;
    }
    // Map the current bookingMode to a (type, code) pair. type !== 0
    // flags the row as a slot block so aggregation services exclude
    // it; code drives the label + color via slot_block_types.
    const slotBlockTypeNum =
      bookingMode === "meeting" ? 1 : bookingMode === "other" ? 2 : 3;
    const slotBlockCode = bookingMode;

    setSaving(true);
    try {
      if (appointment && isExistingSlotBlock) {
        // ----- UPDATE existing slot block -----
        // Reuse the appointment's date, shift the end time if the user
        // changed the duration chip.
        const date = appointment.startAt.slice(0, 10);
        const startTime = appointment.startAt.slice(11, 16);
        const endTime = minutesToTime(
          timeToMinutes(startTime) + slotBlockDuration
        );
        const form = new FormData();
        form.set("start_at", `${date}T${startTime}:00`);
        form.set("end_at", `${date}T${endTime}:00`);
        form.set("memo", customerRecord);
        if (bookingMode === "other") {
          form.set("other_label", otherLabel.trim());
        } else {
          form.set("other_label", "");
        }
        form.set("type", String(slotBlockTypeNum));
        form.set("slot_block_type_code", slotBlockCode);

        const result = await updateAppointment(appointment.id, form);
        if ("error" in result && result.error) {
          toast.error(
            typeof result.error === "string"
              ? result.error
              : "更新に失敗しました"
          );
          setSaving(false);
          return;
        }
        toast.success("予定を更新しました");
        onClose();
        return;
      }

      // ----- CREATE new slot block -----
      if (!newBooking) return;
      const startAt = `${newBooking.date}T${newBooking.time}:00`;
      const endTime = minutesToTime(
        timeToMinutes(newBooking.time) + slotBlockDuration
      );
      const endAt = `${newBooking.date}T${endTime}:00`;

      const form = new FormData();
      form.set("brand_id", String(brandId));
      form.set("shop_id", String(shopId));
      form.set("staff_id", String(newBooking.staffId));
      // customer_id intentionally omitted — the server action attaches
      // a per-shop system placeholder customer so the legacy NOT NULL
      // constraint on appointments.customer_id is satisfied.
      form.set("type", String(slotBlockTypeNum));
      form.set("slot_block_type_code", slotBlockCode);
      form.set("start_at", startAt);
      form.set("end_at", endAt);
      form.set("status", "0");
      form.set("sales", "0");
      form.set("is_couple", "false");
      form.set("memo", customerRecord);
      if (bookingMode === "other") {
        form.set("other_label", otherLabel.trim());
      }

      const result = await createAppointment(form);
      if ("error" in result && result.error) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "登録に失敗しました"
        );
        setSaving(false);
        return;
      }
      toast.success(
        bookingMode === "meeting"
          ? "ミーティングを登録しました"
          : bookingMode === "break"
            ? "休憩を登録しました"
            : "予定を登録しました"
      );
      onClose();
    } catch {
      toast.error("エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSlotBlock() {
    if (!appointment) return;
    if (!confirm("この予定を削除しますか？")) return;
    setSaving(true);
    try {
      const { deleteAppointment } = await import(
        "../actions/reservationActions"
      );
      const result = await deleteAppointment(appointment.id);
      if ("error" in result && result.error) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "削除に失敗しました"
        );
        setSaving(false);
        return;
      }
      toast.success("予定を削除しました");
      onClose();
    } catch {
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

  // Customer info to display on the right-hand panel. For existing
  // appointments we already have enough data on the CalendarAppointment
  // object; for new bookings we lean on the `selectedCustomer` the user
  // just picked in the search dropdown.
  //
  // customerCode is stripped of leading zeros ("00000012" → "12") so
  // the カルテナンバー reads naturally in the UI.
  function stripZeros(code: string | null | undefined): string | null {
    if (!code) return null;
    const t = code.replace(/^0+/, "");
    return t.length > 0 ? t : "0";
  }
  // Slot-block appointments never get the patient dossier (there is
  // no real customer behind them — just a system placeholder row).
  const rightPanelCustomer =
    appointment && !isExistingSlotBlock
      ? {
          id: appointment.customerId,
          name: appointment.customerName,
          code: stripZeros(appointment.customerCode),
          phone: appointment.customerPhone,
          visitCount: appointment.visitCount,
        }
      : !appointment && selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: `${selectedCustomer.last_name ?? ""} ${
              selectedCustomer.first_name ?? ""
            }`.trim() || "-",
            code: stripZeros(selectedCustomer.code),
            phone: selectedCustomer.phone_number_1 ?? null,
            visitCount: null as number | null,
          }
        : null;

  // Expanded = right patient-info panel is shown. We animate the sheet
  // width between two sizes:
  //   - No customer attached  → narrow (480px) docked on the left so
  //                              the calendar behind remains visible
  //   - Customer attached     → full viewport width, so the patient DB
  //                              panel can occupy the right side
  //
  // IMPORTANT: the default Sheet class includes `data-[side=left]:sm:max-w-sm`
  // which has higher CSS specificity than our utility class `sm:max-w-none`
  // (attribute selector wins). That was silently pinning the sheet at
  // 384px and causing the "UIが切れる" bug. Forcing `maxWidth` via
  // inline style wins against the data-attribute selector.
  //
  // NOTE: side="left" — per product direction the new-reservation
  // panel slides in from the left so it sits over the sidebar.
  const expanded = !!rightPanelCustomer;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="left"
        className="overflow-hidden p-0 transition-[max-width] duration-300 ease-out"
        style={{
          maxWidth: expanded ? "100vw" : "480px",
          width: expanded ? "100vw" : "100%",
        }}
      >
        {/* ------- Header ------- */}
        <SheetHeader className="sticky top-0 z-10 border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-bold">
              {isNew ? (
                "新規予約"
              ) : isExistingSlotBlock && appointment?.slotBlock ? (
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className="rounded px-2 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor:
                        appointment.slotBlock.color ?? "#9333ea",
                      color:
                        appointment.slotBlock.labelTextColor ?? "#ffffff",
                    }}
                  >
                    {appointment.slotBlock.label}
                  </span>
                  <span className="font-medium text-gray-500">
                    {startTime}〜
                  </span>
                </span>
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
                    {stripZeros(appointment.customerCode) && (
                      <span className="text-xs font-bold text-gray-500">
                        ({stripZeros(appointment.customerCode)})
                      </span>
                    )}
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

        {/* Two-column body. Left = form (fixed 480px when expanded so
            the right patient panel can take the rest), full-width
            otherwise. Right = patient DB, only rendered in expanded
            mode (see below). */}
        <div className="flex h-[calc(100vh-73px)]">
        <div
          className={`space-y-6 overflow-y-auto px-6 py-5 ${
            expanded
              ? "w-[480px] shrink-0 border-r"
              : "flex-1"
          }`}
        >
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

          {/* ===== Mode switcher =====
              New bookings: pick between 通常予約 / ミーティング / 休憩 /
              その他. Existing slot-block appointments: disable the
              regular tab and let staff flip between slot-block modes
              only (so accidentally switching to "regular" can't wipe
              the meeting they're editing).
              Hidden entirely when the shop master toggle is off. */}
          {(isNew || isExistingSlotBlock) && enableMeetingBooking && (
            <div className="flex flex-wrap gap-2">
              {!isExistingSlotBlock && (
                <button
                  type="button"
                  onClick={() => setBookingMode("regular")}
                  className={`min-w-[100px] flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
                    bookingMode === "regular"
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  新規予約を作成
                </button>
              )}
              <button
                type="button"
                onClick={() => setBookingMode("meeting")}
                className={`min-w-[90px] flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
                  bookingMode === "meeting"
                    ? "border-purple-400 bg-purple-50 text-purple-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                ミーティング
              </button>
              <button
                type="button"
                onClick={() => setBookingMode("break")}
                className={`min-w-[80px] flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
                  bookingMode === "break"
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                休憩
              </button>
              <button
                type="button"
                onClick={() => setBookingMode("other")}
                className={`min-w-[80px] flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
                  bookingMode === "other"
                    ? "border-sky-400 bg-sky-50 text-sky-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                その他
              </button>
            </div>
          )}

          {/* ===== Slot-block form (meeting / other / break) =====
              Shown for new bookings in slot-block mode AND for
              existing slot-block appointments (edit mode). */}
          {(isNew || isExistingSlotBlock) && isSlotBlockMode && (
            <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-[11px] font-bold text-gray-500">
                {bookingMode === "meeting"
                  ? "ミーティング内容"
                  : bookingMode === "break"
                    ? "休憩メモ"
                    : "内容"}
              </div>
              {bookingMode === "other" && (
                <Input
                  placeholder="例: 外出 / 電話対応 / 備品搬入 など"
                  value={otherLabel}
                  onChange={(e) => setOtherLabel(e.target.value)}
                  maxLength={128}
                />
              )}
              <div>
                <Label className="text-[11px] font-bold text-gray-500">
                  時間
                </Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SLOT_BLOCK_DURATIONS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setSlotBlockDuration(min)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                        slotBlockDuration === min
                          ? "border-blue-400 bg-blue-500 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"
                      }`}
                    >
                      {min}分
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={customerRecord}
                onChange={(e) => setCustomerRecord(e.target.value)}
                rows={3}
                placeholder="メモ（任意）"
                className="resize-none bg-white"
              />
              <p className="text-[10px] text-gray-400">
                ※ この予約は稼働率・売上集計には含まれません
              </p>
              <Button
                size="lg"
                className="w-full bg-gray-900 py-5 text-base font-black hover:bg-gray-800"
                onClick={handleSaveSlotBlock}
                disabled={saving}
              >
                {saving
                  ? "保存中..."
                  : isExistingSlotBlock
                    ? "予定を更新"
                    : bookingMode === "meeting"
                      ? "ミーティングを登録"
                      : bookingMode === "break"
                        ? "休憩を登録"
                        : "予定を登録"}
              </Button>
              {isExistingSlotBlock && (
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-2 border-red-400 text-red-600 hover:bg-red-50"
                  onClick={handleDeleteSlotBlock}
                  disabled={saving}
                >
                  この予定を削除
                </Button>
              )}
            </section>
          )}

          {/* ===== Regular booking form (hidden in slot-block mode) ===== */}
          {!isSlotBlockMode && !isExistingSlotBlock && (
          <>
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
                    placeholder="名前・電話番号・カルテNo で検索..."
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
                              {stripZeros(c.code) && (
                                <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">
                                  No.{stripZeros(c.code)}
                                </span>
                              )}
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
            {/* Larger textarea per spec ("カルテ入力の利便性を高めるため
                入力エリアをより広く確保") — resize vertically so staff
                can expand further if they need to. */}
            <Textarea
              value={customerRecord}
              onChange={(e) => setCustomerRecord(e.target.value)}
              rows={10}
              placeholder="所見・次回への引き継ぎ"
              className="min-h-[220px] resize-y"
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
                指標 ダッシュボードの G口コミ / H口コミ hero cards.

                Only shown once a customer is attached to the flow
                (existing appointment, or new booking after a customer
                was picked in search) — otherwise it would be disabled
                and look broken. */}
            {activeCustomerId != null && (
              <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                <div className="text-[11px] font-bold text-emerald-700">
                  口コミ受領チェック
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hasGoogleReview}
                    disabled={reviewSaving !== null}
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
                    disabled={reviewSaving !== null}
                    onChange={() => handleToggleReview("hotpepper")}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                  />
                  <span className="font-bold text-gray-800">H口コミ</span>
                  <span className="text-[11px] text-gray-500">
                    HotPepperレビューを頂いた
                  </span>
                </label>
              </div>
            )}
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
          </>
          )}
        </div>
        {/* ===== Right column: 患者DB (expanded only) =====
            Mirrors /customer/:id so "久しぶりに来院された患者さんへの
            電話対応" can happen with all the context already visible. */}
        {expanded && rightPanelCustomer && (
          <div className="flex-1 overflow-y-auto bg-gray-50 px-8 py-6">
            <CustomerDossierPanel
              rightPanelCustomer={rightPanelCustomer}
              detail={customerDetail}
              loading={customerDetailLoading}
              stripZeros={stripZeros}
            />
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// CustomerDossierPanel
// ---------------------------------------------------------------------------
// Rendered inside the right half of the detail sheet when a customer
// is attached. Mirrors the /customer/:id page as faithfully as the
// sheet width allows: 4 KPI cards (来店回数 / 累計売上 / ステータス /
// 最終来院) + 基本情報 card + 来院履歴 list (latest 50, newest first).
//
// Kept in the same file to avoid a trivial component split — the panel
// is never reused outside this sheet.
// ---------------------------------------------------------------------------

type DossierCustomer = {
  id: number;
  name: string;
  code: string | null;
  phone: string | null;
};

type DossierDetail = {
  customer: {
    id: number;
    code: string;
    last_name: string | null;
    first_name: string | null;
    last_name_kana: string | null;
    first_name_kana: string | null;
    phone_number_1: string | null;
    phone_number_2: string | null;
    email: string | null;
    zip_code: string | null;
    address: string | null;
    gender: number;
    birth_date: string | null;
    type: number;
    occupation: string | null;
    line_id: string | null;
    description: string | null;
    created_at: string;
  };
  visitCount: number;
  totalSales: number;
  lastVisitDate: string | null;
  appointments: Array<{
    id: number;
    startAt: string;
    endAt: string;
    status: number;
    sales: number;
    customerRecord: string | null;
    memo: string | null;
    menuName: string;
    staffName: string | null;
  }>;
};

const GENDER_LABELS: Record<number, string> = {
  0: "男性",
  1: "女性",
  2: "その他",
};
const TYPE_LABELS: Record<number, { label: string; cls: string }> = {
  0: { label: "一般", cls: "bg-gray-100 text-gray-700" },
  1: { label: "会員", cls: "bg-blue-100 text-blue-700" },
  2: { label: "退会", cls: "bg-red-100 text-red-700" },
};

function CustomerDossierPanel({
  rightPanelCustomer,
  detail,
  loading,
  stripZeros,
}: {
  rightPanelCustomer: DossierCustomer;
  detail: DossierDetail | null;
  loading: boolean;
  stripZeros: (code: string | null | undefined) => string | null;
}) {
  // Until the dossier arrives, fall back to the sparse data we already
  // have from the calendar / search (so the header doesn't flicker).
  const customer = detail?.customer ?? null;
  const fullName =
    customer
      ? [customer.last_name, customer.first_name].filter(Boolean).join(" ") ||
        rightPanelCustomer.name
      : rightPanelCustomer.name;
  const kanaName = customer
    ? [customer.last_name_kana, customer.first_name_kana]
        .filter(Boolean)
        .join(" ")
    : "";
  const visitCount = detail?.visitCount ?? 0;
  const totalSales = detail?.totalSales ?? 0;
  const lastVisitDate = detail?.lastVisitDate ?? "-";
  const typeInfo =
    TYPE_LABELS[customer?.type ?? 0] ?? TYPE_LABELS[0];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* ===== Header row — name + カルテ No + 4 KPI cards ===== */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase text-gray-400">
            患者データベース
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Link
              href={`/customer/${rightPanelCustomer.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl font-black text-gray-900 hover:text-blue-600 hover:underline"
            >
              {fullName}
            </Link>
            {stripZeros(rightPanelCustomer.code) && (
              <span className="rounded-md bg-gray-900 px-2 py-0.5 text-sm font-black text-white">
                No.{stripZeros(rightPanelCustomer.code)}
              </span>
            )}
            <Badge
              variant="outline"
              className={`text-xs ${typeInfo.cls}`}
            >
              {typeInfo.label}
            </Badge>
            <ExternalLink className="h-4 w-4 text-gray-400" />
          </div>
          {kanaName && (
            <div className="mt-0.5 text-xs text-gray-500">{kanaName}</div>
          )}
        </div>
      </div>

      {/* ===== 4 KPI cards — 来店回数 / 累計売上 / ステータス / 最終来院 ===== */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-500">来院回数</div>
          <div className="mt-1 text-2xl font-black text-gray-900">
            {loading ? "…" : `${visitCount}回`}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-500">累計売上</div>
          <div className="mt-1 text-2xl font-black text-gray-900">
            {loading ? "…" : `¥${totalSales.toLocaleString()}`}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-500">ステータス</div>
          <div className="mt-1">
            <Badge className={typeInfo.cls}>{typeInfo.label}</Badge>
          </div>
        </div>
        <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-500">最終来院</div>
          <div className="mt-1 text-lg font-bold text-gray-900">
            {loading ? "…" : lastVisitDate}
          </div>
        </div>
      </div>

      {/* ===== Main grid — 基本情報 (1/3) + 来院履歴 (2/3) ===== */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Basic info */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-bold text-gray-900">基本情報</div>
          {loading ? (
            <div className="text-sm text-gray-400">読み込み中...</div>
          ) : !customer ? (
            <div className="text-sm text-gray-400">
              顧客情報の取得に失敗しました
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {customer.phone_number_1 && (
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-gray-400">電話</span>
                  <span className="text-gray-800">
                    {customer.phone_number_1}
                  </span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-gray-400">Email</span>
                  <span className="break-all text-gray-800">
                    {customer.email}
                  </span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-gray-400">住所</span>
                  <span className="text-gray-800">
                    {customer.zip_code && (
                      <span className="text-gray-500">
                        〒{customer.zip_code}{" "}
                      </span>
                    )}
                    {customer.address}
                  </span>
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">性別: </span>
                  <span className="text-gray-800">
                    {GENDER_LABELS[customer.gender ?? 0] ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">生年月日: </span>
                  <span className="text-gray-800">
                    {customer.birth_date || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">職業: </span>
                  <span className="text-gray-800">
                    {customer.occupation || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">LINE: </span>
                  <span className="text-gray-800">
                    {customer.line_id || "-"}
                  </span>
                </div>
              </div>
              {customer.description && (
                <>
                  <Separator />
                  <div>
                    <div className="text-[11px] font-bold text-gray-400">
                      メモ
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                      {customer.description}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Visit history */}
        <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-gray-900">
              来院履歴・カルテ
            </div>
            {detail && (
              <div className="text-[11px] text-gray-400">
                直近 {detail.appointments.length} 件
              </div>
            )}
          </div>
          {loading ? (
            <div className="text-sm text-gray-400">読み込み中...</div>
          ) : !detail || detail.appointments.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              来院履歴がありません
            </div>
          ) : (
            <div className="space-y-3">
              {detail.appointments.map((a) => {
                const date = a.startAt.slice(0, 10);
                const time = a.startAt.slice(11, 16);
                const endTime = a.endAt.slice(11, 16);
                const isCancelled =
                  a.status === 3 || a.status === 4 || a.status === 99;
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border p-3 ${
                      isCancelled ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-gray-900">{date}</span>
                      <span className="text-xs text-gray-500">
                        {time}-{endTime}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {a.menuName}
                      </Badge>
                      {isCancelled && (
                        <Badge className="bg-red-100 text-[10px] text-red-600">
                          {a.status === 4 ? "当日キャンセル" : "キャンセル"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      {a.staffName && <span>担当 {a.staffName}</span>}
                      {a.sales > 0 && (
                        <span>¥{a.sales.toLocaleString()}</span>
                      )}
                    </div>
                    {a.customerRecord && (
                      <div className="mt-2 rounded bg-gray-50 p-2 text-xs">
                        <div className="mb-0.5 text-[10px] font-bold text-gray-400">
                          カルテ
                        </div>
                        <p className="whitespace-pre-wrap text-gray-700">
                          {a.customerRecord}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
