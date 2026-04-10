"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Step1StoreDateTime } from "./public/Step1StoreDateTime";
import { Step2CustomerInfo } from "./public/Step2CustomerInfo";
import { Step3Confirm } from "./public/Step3Confirm";
import { Step4Complete } from "./public/Step4Complete";
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

type WizardStep = 1 | 2 | 3 | 4;

interface PublicBookingWizardProps {
  link: PublicLink;
  areas: PublicArea[];
  shops: PublicShop[];
  staffs: PublicStaff[];
  menus: PublicMenu[];
  utmSource: string | null;
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
}: PublicBookingWizardProps) {
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
  const [confirmedDateTime, setConfirmedDateTime] = useState<string | null>(
    null
  );

  function patchState(patch: Partial<BookingState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  const selectedShop = shops.find((s) => s.id === state.shopId) ?? null;
  const selectedStaff = staffs.find((s) => s.id === state.staffId) ?? null;
  const selectedMenu =
    menus.find((m) => m.menu_manage_id === state.menuManageId) ?? null;

  async function handleSubmit() {
    if (!state.shopId || !state.menuManageId || !state.date || !state.time) {
      toast.error("選択内容が不完全です");
      return;
    }
    if (!selectedMenu) {
      toast.error("メニューが選択されていません");
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
    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(String(result.error));
      return;
    }

    setConfirmedDateTime(`${state.date.replace(/-/g, ".")} ${state.time}`);
    setStep(4);
  }

  return (
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
        />
      )}
      {step === 4 && (
        <Step4Complete link={link} confirmedDateTime={confirmedDateTime} />
      )}
    </div>
  );
}
