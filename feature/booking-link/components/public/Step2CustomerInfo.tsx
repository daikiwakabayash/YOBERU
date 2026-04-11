"use client";

import { Check, MapPin, Tag, Calendar } from "lucide-react";
import { StepHeader } from "./Step1StoreDateTime";
import type {
  BookingState,
  PublicLink,
  PublicMenu,
  PublicShop,
} from "./types";
import { useT } from "../../i18n/useT";
import type { Lang } from "../../i18n/dictionary";

interface Step2Props {
  state: BookingState;
  setState: (patch: Partial<BookingState>) => void;
  link: PublicLink;
  shop: PublicShop | null;
  menu: PublicMenu | null;
  onBack: () => void;
  onNext: () => void;
  lang?: Lang;
}

/**
 * Validation: all required fields present
 */
function isStep2Valid(s: BookingState, requirePolicy: boolean): boolean {
  if (!s.lastName.trim()) return false;
  if (!s.firstName.trim()) return false;
  if (!s.lastNameKana.trim()) return false;
  if (!s.firstNameKana.trim()) return false;
  if (!s.phone.trim() || !/^\d{10,11}$/.test(s.phone.replace(/-/g, "")))
    return false;
  if (!s.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email))
    return false;
  if (requirePolicy && !s.cancelPolicyAccepted) return false;
  return true;
}

export function Step2CustomerInfo({
  state,
  setState,
  link,
  shop,
  menu,
  onBack,
  onNext,
  lang = "ja",
}: Step2Props) {
  const { t } = useT(lang);
  const valid = isStep2Valid(state, link.require_cancel_policy);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ‹ {t("back")}
          </button>
          <h2 className="flex-1 text-center text-base font-medium">
            {t("formTitle")}
          </h2>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <StepHeader stepNumber={2} total={3} title={t("step2Title")} />

        {/* Name fields */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <LabeledInput
            label={t("fieldLastName")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.lastName}
            onChange={(v) => setState({ lastName: v })}
            placeholder="山田"
            valid={state.lastName.trim().length > 0}
          />
          <LabeledInput
            label={t("fieldFirstName")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.firstName}
            onChange={(v) => setState({ firstName: v })}
            placeholder="太郎"
            valid={state.firstName.trim().length > 0}
          />
          <LabeledInput
            label={t("fieldLastNameKana")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.lastNameKana}
            onChange={(v) => setState({ lastNameKana: v })}
            placeholder="やまだ"
            valid={state.lastNameKana.trim().length > 0}
          />
          <LabeledInput
            label={t("fieldFirstNameKana")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.firstNameKana}
            onChange={(v) => setState({ firstNameKana: v })}
            placeholder="たろう"
            valid={state.firstNameKana.trim().length > 0}
          />
        </div>

        {/* Phone */}
        <div className="mb-3">
          <LabeledInput
            label={t("fieldPhone")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.phone}
            onChange={(v) => setState({ phone: v })}
            placeholder="09012345678"
            inputMode="numeric"
            maxLength={11}
            valid={/^\d{10,11}$/.test(state.phone.replace(/-/g, ""))}
          />
        </div>

        {/* Email */}
        <div className="mb-4">
          <LabeledInput
            label={t("fieldEmail")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.email}
            onChange={(v) => setState({ email: v })}
            placeholder="example@ex.jp"
            type="email"
            valid={/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.email)}
          />
        </div>

        {/* Cancel policy */}
        {link.require_cancel_policy && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <span>📋</span>
              {t("cancelPolicyHeading")}
            </div>
            {link.cancel_policy_text && (
              <p className="mb-3 whitespace-pre-wrap text-[12px] text-gray-600">
                • {link.cancel_policy_text}
              </p>
            )}
            <label className="flex cursor-pointer items-center justify-end gap-1.5">
              <span className="text-xs text-gray-600">
                {t("cancelPolicyAccept")}
              </span>
              <input
                type="checkbox"
                checked={state.cancelPolicyAccepted}
                onChange={(e) =>
                  setState({ cancelPolicyAccepted: e.target.checked })
                }
                className="sr-only peer"
              />
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  state.cancelPolicyAccepted
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-gray-300 bg-white"
                }`}
              >
                {state.cancelPolicyAccepted && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </span>
            </label>
          </div>
        )}

        {/* Reservation summary */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 text-xs text-gray-600">
          {shop && (
            <div className="mb-1 flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-gray-400" />
              <span>{shop.name}</span>
            </div>
          )}
          {menu && (
            <div className="mb-1 flex items-center gap-1.5">
              <Tag className="h-3 w-3 text-gray-400" />
              <span>
                {link.alias_menu_name ?? menu.name}
                {menu.duration > 0 && `(${menu.duration}${t("minutes")})`}
                {menu.price > 0 &&
                  ` ${menu.price.toLocaleString()}${t("yenSuffix")}`}
              </span>
            </div>
          )}
          {state.date && state.time && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-gray-400" />
              <span>
                {state.date.replace(/-/g, ".")} {state.time}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer button */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          disabled={!valid}
          onClick={onNext}
          className={`w-full rounded-full py-3.5 text-sm font-bold text-white transition-colors ${
            valid
              ? "bg-emerald-500 hover:bg-emerald-600"
              : "cursor-not-allowed bg-gray-300"
          }`}
        >
          {t("proceedToConfirm")}
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  required,
  requiredLabel,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
  valid,
}: {
  label: string;
  required?: boolean;
  requiredLabel?: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "email" | "tel";
  maxLength?: number;
  valid?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5">
        <label className="text-xs font-medium text-gray-700">{label}</label>
        {required && (
          <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">
            {requiredLabel ?? "必須"}
          </span>
        )}
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
      <div className="relative">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`h-10 w-full rounded-md border bg-white px-3 pr-9 text-sm focus:outline-none focus:ring-2 ${
            valid
              ? "border-emerald-300 focus:ring-emerald-200"
              : "border-gray-200 focus:ring-gray-200"
          }`}
        />
        {valid && (
          <span className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-3 w-3 text-white" />
          </span>
        )}
      </div>
    </div>
  );
}
