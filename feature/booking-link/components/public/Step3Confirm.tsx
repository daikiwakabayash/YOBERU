"use client";

import { StepHeader } from "./Step1StoreDateTime";
import type {
  BookingState,
  PublicLink,
  PublicMenu,
  PublicShop,
  PublicStaff,
} from "./types";

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
}: Step3Props) {
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
            ‹ 戻る
          </button>
          <h2 className="flex-1 text-center text-base font-medium">
            ご予約フォーム
          </h2>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <StepHeader stepNumber={3} total={3} title="ご注文確認" />

        <div className="space-y-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {shop && (
            <SummaryRow
              label="店舗"
              value={shop.name}
              subValue={shop.address ?? undefined}
              onEdit={() => onEdit("step1")}
            />
          )}
          {link.staff_mode !== 2 && (
            <SummaryRow
              label="スタッフ"
              value={
                state.staffId === 0
                  ? "おまかせ"
                  : staff?.name ?? "-"
              }
              onEdit={() => onEdit("step1")}
            />
          )}
          {menu && (
            <SummaryRow
              label="メニュー"
              value={link.alias_menu_name ?? menu.name}
              subValue={`${menu.duration}分${
                menu.price > 0 ? ` / ¥${menu.price.toLocaleString()}` : ""
              }`}
              onEdit={() => onEdit("step1")}
            />
          )}
          {state.date && state.time && (
            <SummaryRow
              label="日時"
              value={`${state.date.replace(/-/g, ".")} ${state.time}`}
              onEdit={() => onEdit("step1")}
            />
          )}
          <SummaryRow
            label="お名前"
            value={`${state.lastName} ${state.firstName}`}
            subValue={`${state.lastNameKana} ${state.firstNameKana}`}
            onEdit={() => onEdit("step2")}
          />
          <SummaryRow
            label="電話番号"
            value={state.phone}
            onEdit={() => onEdit("step2")}
          />
          <SummaryRow
            label="メールアドレス"
            value={state.email}
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
          {submitting ? "送信中..." : "ご予約を確定する"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onBack}
          className="w-full rounded-full border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          キャンセル
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
  last,
}: {
  label: string;
  value: string;
  subValue?: string;
  onEdit: () => void;
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
        変更
      </button>
    </div>
  );
}
