"use client";

import { StepHeader } from "./Step1StoreDateTime";
import type {
  BookingState,
  PublicLink,
  PublicMenu,
  PublicShop,
  PublicStaff,
} from "./types";
import { useT } from "../../i18n/useT";
import type { Lang } from "../../i18n/dictionary";

interface Step3Props {
  state: BookingState;
  link: PublicLink;
  shop: PublicShop | null;
  staff: PublicStaff | null;
  menu: PublicMenu | null;
  onBack: () => void;
  onEdit: (target: "step1" | "step2") => void;
  onSubmit: () => void;
  submitting: boolean;
  lang?: Lang;
}

export function Step3Confirm({
  state,
  link,
  shop,
  staff,
  menu,
  onBack,
  onEdit,
  onSubmit,
  submitting,
  lang = "ja",
}: Step3Props) {
  const { t } = useT(lang);
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
        <StepHeader stepNumber={3} total={3} title={t("step3Title")} />

        <div className="space-y-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {shop && (
            <SummaryRow
              label={t("confirmShop")}
              value={shop.name}
              subValue={shop.address ?? undefined}
              editLabel={t("edit")}
              onEdit={() => onEdit("step1")}
            />
          )}
          {link.staff_mode !== 2 && (
            <SummaryRow
              label={t("confirmStaff")}
              value={
                state.staffId === 0 ? t("anyStaff") : staff?.name ?? "-"
              }
              editLabel={t("edit")}
              onEdit={() => onEdit("step1")}
            />
          )}
          {menu && (
            <SummaryRow
              label={t("confirmMenu")}
              value={link.alias_menu_name ?? menu.name}
              subValue={`${menu.duration}${t("minutes")}${
                menu.priceDispType && menu.price > 0
                  ? ` / ¥${menu.price.toLocaleString()}`
                  : ""
              }`}
              editLabel={t("edit")}
              onEdit={() => onEdit("step1")}
            />
          )}
          {state.date && state.time && (
            <SummaryRow
              label={t("confirmDateTime")}
              value={`${state.date.replace(/-/g, ".")} ${state.time}`}
              editLabel={t("edit")}
              onEdit={() => onEdit("step1")}
            />
          )}
          <SummaryRow
            label={t("confirmCustomer")}
            value={`${state.lastName} ${state.firstName}`}
            subValue={`${state.lastNameKana} ${state.firstNameKana}`}
            editLabel={t("edit")}
            onEdit={() => onEdit("step2")}
          />
          <SummaryRow
            label={t("fieldPhone")}
            value={state.phone}
            editLabel={t("edit")}
            onEdit={() => onEdit("step2")}
          />
          <SummaryRow
            label={t("fieldEmail")}
            value={state.email}
            editLabel={t("edit")}
            onEdit={() => onEdit("step2")}
            last
          />
        </div>
      </div>

      {/* Footer buttons */}
      <div className="sticky bottom-0 space-y-2 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="w-full rounded-full bg-emerald-500 py-3.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? t("submitting") : t("submitBooking")}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onBack}
          className="w-full rounded-full border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {t("back")}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  subValue,
  onEdit,
  editLabel,
  last,
}: {
  label: string;
  value: string;
  subValue?: string;
  onEdit: () => void;
  editLabel: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between px-3 py-3 ${
        last ? "" : "border-b border-gray-100"
      }`}
    >
      <div className="flex-1 pr-2">
        <div className="text-[11px] text-gray-500">{label}</div>
        <div className="text-sm font-medium text-gray-900">{value}</div>
        {subValue && (
          <div className="text-[11px] text-gray-500">{subValue}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded border border-gray-300 bg-white px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
      >
        {editLabel}
      </button>
    </div>
  );
}
