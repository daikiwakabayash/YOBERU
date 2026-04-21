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
 * 電話番号バリデーション: 日本の電話番号形式 (先頭 0、全 10〜11 桁、
 * ハイフン/記号/空白禁止) のみを許容する。ユーザーには「ハイフン
 * なし」を明示するが、誤入力された場合でも isValidPhone が false を
 * 返すので送信ボタンが押せずに済む。
 */
const PHONE_RE = /^0\d{9,10}$/;
function isValidPhone(v: string): boolean {
  return PHONE_RE.test(v);
}

/**
 * メールアドレスバリデーション: 最低限の形式チェックに加え、代表的な
 * ドメイン typo (gmial.com など) を弾く。完全な実在確認は送信後の
 * 確認メールで検証する想定。
 */
const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const EMAIL_TYPO_DOMAINS = new Set([
  "gmial.com",
  "gmai.com",
  "gmial.co.jp",
  "gnail.com",
  "yaho.co.jp",
  "yhaoo.co.jp",
  "hotmai.com",
  "outlok.com",
  "icould.com",
]);
function isValidEmail(v: string): boolean {
  if (!EMAIL_RE.test(v)) return false;
  if (v.length > 254) return false;
  const domain = v.slice(v.lastIndexOf("@") + 1).toLowerCase();
  if (EMAIL_TYPO_DOMAINS.has(domain)) return false;
  // TLD は 2 文字以上
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (tld.length < 2) return false;
  return true;
}

/**
 * Validation: all required fields present
 */
function isStep2Valid(s: BookingState, requirePolicy: boolean): boolean {
  if (!s.lastName.trim()) return false;
  if (!s.firstName.trim()) return false;
  if (!s.lastNameKana.trim()) return false;
  if (!s.firstNameKana.trim()) return false;
  if (!isValidPhone(s.phone.trim())) return false;
  if (!isValidEmail(s.email.trim())) return false;
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
            placeholder="ヤマダ"
            valid={state.lastNameKana.trim().length > 0}
          />
          <LabeledInput
            label={t("fieldFirstNameKana")}
            requiredLabel={t("fieldNameRequired")}
            required
            value={state.firstNameKana}
            onChange={(v) => setState({ firstNameKana: v })}
            placeholder="タロウ"
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
            hint={lang === "en" ? "Digits only, no hyphens" : "ハイフンなしで入力"}
            inputMode="numeric"
            maxLength={11}
            valid={isValidPhone(state.phone.trim())}
            errorMessage={
              state.phone.trim().length === 0
                ? undefined
                : /[-－ー 　]/.test(state.phone)
                  ? lang === "en"
                    ? "Please enter digits only (no hyphens or spaces)"
                    : "ハイフン・スペースは使えません。数字のみで入力してください"
                  : !isValidPhone(state.phone.trim())
                    ? lang === "en"
                      ? "Enter a valid Japanese phone number (10-11 digits starting with 0)"
                      : "電話番号の形式が正しくありません (0で始まる10〜11桁)"
                    : undefined
            }
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
            valid={isValidEmail(state.email.trim())}
            errorMessage={
              state.email.trim().length === 0
                ? undefined
                : !isValidEmail(state.email.trim())
                  ? lang === "en"
                    ? "Please enter a valid email address"
                    : "メールアドレスの形式が正しくありません"
                  : undefined
            }
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
                {menu.priceDispType &&
                  menu.price > 0 &&
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
  errorMessage,
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
  /** 入力ミスをその場でユーザーに伝えるためのメッセージ。空なら非表示。
   *  errorMessage が立っているときは枠を赤でハイライトし「送信できる
   *  形式になっていない」ことを視覚的に示す。 */
  errorMessage?: string;
}) {
  const showError = !!errorMessage;
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
          aria-invalid={showError || undefined}
          className={`h-10 w-full rounded-md border bg-white px-3 pr-9 text-sm focus:outline-none focus:ring-2 ${
            showError
              ? "border-red-400 focus:ring-red-200"
              : valid
                ? "border-emerald-300 focus:ring-emerald-200"
                : "border-gray-200 focus:ring-gray-200"
          }`}
        />
        {valid && !showError && (
          <span className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-3 w-3 text-white" />
          </span>
        )}
      </div>
      {showError && (
        <p className="mt-1 text-[11px] font-medium text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
