"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Step1StoreDateTime } from "./public/Step1StoreDateTime";
import { Step2CustomerInfo } from "./public/Step2CustomerInfo";
import { Step3Confirm } from "./public/Step3Confirm";
import { LanguageToggle } from "./public/LanguageToggle";
import type {
  BookingState,
  PublicArea,
  PublicLink,
  PublicMenu,
  PublicShop,
  PublicStaff,
} from "./public/types";
import { submitPublicBooking } from "../actions/bookingLinkActions";
import { timeToMinutes, minutesToTime } from "@/helper/utils/time";
import { useT } from "../i18n/useT";
import type { Lang } from "../i18n/dictionary";
import type { ShopAvailabilityDay } from "../services/getShopAvailability";
import type { StaffFreeDay } from "../services/getShopStaffFreeSlots";

type WizardStep = 1 | 2 | 3;

interface PublicBookingWizardProps {
  link: PublicLink;
  areas: PublicArea[];
  shops: PublicShop[];
  staffs: PublicStaff[];
  menus: PublicMenu[];
  utmSource: string | null;
  lang?: Lang;
  /**
   * Map shop_id → (date YYYY-MM-DD → open window or null when closed).
   * Computed server-side so the calendar can grey out closed days.
   */
  availabilityByShop?: Record<
    number,
    Record<string, ShopAvailabilityDay | null>
  >;
  /**
   * Map shop_id → (date YYYY-MM-DD → array of per-staff free 30-min slot
   * sets). Used by the calendar so that slots where every on-duty staff is
   * already booked are marked as "×" even before the user selects a staff.
   */
  staffFreeByShop?: Record<number, Record<string, StaffFreeDay[]>>;
}

const INITIAL_STATE: BookingState = {
  areaId: null,
  shopId: null,
  staffId: null,
  menuManageId: null,
  date: null,
  time: null,
  lastName: "",
  firstName: "",
  lastNameKana: "",
  firstNameKana: "",
  phone: "",
  email: "",
  cancelPolicyAccepted: false,
};

export function PublicBookingWizard({
  link,
  areas,
  shops,
  staffs,
  menus,
  utmSource,
  lang = "ja",
  availabilityByShop,
  staffFreeByShop,
}: PublicBookingWizardProps) {
  const { t } = useT(lang);
  const [step, setStep] = useState<WizardStep>(1);
  const [state, setState] = useState<BookingState>(() => ({
    ...INITIAL_STATE,
    // Auto-pick single options
    areaId: areas.length === 1 ? areas[0].id : null,
    shopId: shops.length === 1 ? shops[0].id : null,
    menuManageId: menus.length === 1 ? menus[0].menu_manage_id : null,
    staffId: link.staff_mode === 2 ? 0 : null,
  }));
  const [submitting, setSubmitting] = useState(false);

  function patchState(patch: Partial<BookingState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  const selectedShop = shops.find((s) => s.id === state.shopId) ?? null;
  const selectedStaff = staffs.find((s) => s.id === state.staffId) ?? null;
  const selectedMenu =
    menus.find((m) => m.menu_manage_id === state.menuManageId) ?? null;

  async function handleSubmit() {
    if (!state.shopId || !state.menuManageId || !state.date || !state.time) {
      toast.error(t("selectionIncomplete"));
      return;
    }
    if (!selectedMenu) {
      toast.error(t("menuNotSelected"));
      return;
    }

    setSubmitting(true);

    const duration = selectedMenu.duration || 60;
    const startAt = `${state.date}T${state.time}:00`;
    const endTime = minutesToTime(timeToMinutes(state.time) + duration);
    const endAt = `${state.date}T${endTime}:00`;

    const form = new FormData();
    form.set("slug", link.slug);
    form.set("shop_id", String(state.shopId));
    form.set("menu_manage_id", state.menuManageId);
    if (state.staffId && state.staffId !== 0) {
      form.set("staff_id", String(state.staffId));
    }
    form.set("start_at", startAt);
    form.set("end_at", endAt);
    form.set("last_name", state.lastName);
    form.set("first_name", state.firstName);
    form.set("last_name_kana", state.lastNameKana);
    form.set("first_name_kana", state.firstNameKana);
    form.set("phone", state.phone);
    form.set("email", state.email);
    if (utmSource) form.set("utm_source", utmSource);

    const result = await submitPublicBooking(form);

    if ("error" in result && result.error) {
      setSubmitting(false);
      toast.error(String(result.error));
      return;
    }

    // Hard-navigate to the common /booking-complete page so that:
    //   - the URL changes (shareable, distinct from the form URL), and
    //   - Google Tag Manager fires a fresh PageView on the new path
    //     (required for conversion tracking).
    const params = new URLSearchParams({
      slug: link.slug,
      date: state.date,
      time: state.time,
      lang,
    });
    // 公式 LINE 紐付けボタン用に line_link_token を引き継ぐ
    const tokenResult = result as { lineLinkToken?: string | null };
    if (tokenResult.lineLinkToken) {
      params.set("link_token", tokenResult.lineLinkToken);
    }
    window.location.assign(`/booking-complete?${params.toString()}`);
  }

  return (
    <>
      {/* Floating language toggle (top-right of viewport) */}
      <LanguageToggle active={lang} />
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white sm:my-4 sm:min-h-0 sm:rounded-xl sm:shadow-lg">
        {step === 1 && (
          <Step1StoreDateTime
            state={state}
            setState={patchState}
            link={link}
            areas={areas}
            shops={shops}
            staffs={staffs}
            menus={menus}
            onNext={() => setStep(2)}
            lang={lang}
            availabilityByShop={availabilityByShop}
            staffFreeByShop={staffFreeByShop}
          />
        )}
        {step === 2 && (
          <Step2CustomerInfo
            state={state}
            setState={patchState}
            link={link}
            shop={selectedShop}
            menu={selectedMenu}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            lang={lang}
          />
        )}
        {step === 3 && (
          <Step3Confirm
            state={state}
            link={link}
            shop={selectedShop}
            staff={selectedStaff}
            menu={selectedMenu}
            onBack={() => setStep(2)}
            onEdit={(target) => setStep(target === "step1" ? 1 : 2)}
            onSubmit={handleSubmit}
            submitting={submitting}
            lang={lang}
          />
        )}
      </div>
    </>
  );
}
