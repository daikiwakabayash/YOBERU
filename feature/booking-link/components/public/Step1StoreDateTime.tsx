"use client";

import { useState, useMemo, useEffect } from "react";
import { MapPin, Tag, User, Calendar, Info } from "lucide-react";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { ShopMapSheet } from "./ShopMapSheet";
import type {
  BookingState,
  PublicArea,
  PublicShop,
  PublicStaff,
  PublicMenu,
  PublicLink,
} from "./types";
import { useT } from "../../i18n/useT";
import type { Lang } from "../../i18n/dictionary";
import type { ShopAvailabilityDay } from "../../services/getShopAvailability";

interface Step1Props {
  state: BookingState;
  setState: (patch: Partial<BookingState>) => void;
  link: PublicLink;
  areas: PublicArea[];
  shops: PublicShop[];
  staffs: PublicStaff[];
  menus: PublicMenu[];
  onNext: () => void;
  lang?: Lang;
  /** True when navigated here from Step 3 edit — shows back/next buttons */
  fromEdit?: boolean;
  availabilityByShop?: Record<
    number,
    Record<string, ShopAvailabilityDay | null>
  >;
}

/**
 * Step 1: 店舗と日時を選ぶ
 * Structure: エリア → 店舗 → スタッフ → メニュー → 希望の日時
 * Each field reveals after the previous is selected.
 */
export function Step1StoreDateTime({
  state,
  setState,
  link,
  areas,
  shops,
  staffs,
  menus,
  onNext,
  lang = "ja",
  availabilityByShop,
}: Step1Props) {
  const { t } = useT(lang);
  const [mapShop, setMapShop] = useState<PublicShop | null>(null);

  // The calendar only knows about one shop's availability at a time.
  // When the user has picked a shop, scope to that shop's map; otherwise
  // fall back to the first shop's map (single-shop links) or undefined.
  const shopAvailability = (() => {
    if (!availabilityByShop) return undefined;
    if (state.shopId) return availabilityByShop[state.shopId];
    if (shops.length === 1) return availabilityByShop[shops[0].id];
    return undefined;
  })();
  const [expandedField, setExpandedField] = useState<
    "area" | "shop" | "staff" | "menu" | "datetime" | null
  >(() => {
    // Auto-expand first unfilled field
    if (!state.areaId && areas.length > 1) return "area";
    if (!state.shopId) return "shop";
    if (link.staff_mode !== 2 && !state.staffId && state.staffId !== 0)
      return "staff";
    if (!state.menuManageId && menus.length > 1) return "menu";
    if (!state.date) return "datetime";
    return null;
  });

  // If there's only one area, auto-select it (since link shop is fixed)
  useMemo(() => {
    if (!state.areaId && areas.length === 1) {
      setState({ areaId: areas[0].id });
    }
    if (!state.shopId && shops.length === 1) {
      setState({ shopId: shops[0].id, areaId: shops[0].area_id });
    }
    // If only one menu, auto-select
    if (!state.menuManageId && menus.length === 1) {
      setState({ menuManageId: menus[0].menu_manage_id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedShop = shops.find((s) => s.id === state.shopId) ?? null;
  const selectedArea = areas.find((a) => a.id === state.areaId) ?? null;
  const selectedMenu =
    menus.find((m) => m.menu_manage_id === state.menuManageId) ?? null;
  const selectedStaff = staffs.find((s) => s.id === state.staffId) ?? null;

  // Fetch booked time slots for the selected staff so the calendar
  // can mark occupied slots as "×". Runs every time staff or shop
  // changes (not on every week navigation — the data covers 60 days
  // ahead so most navigations are covered by the cached result).
  type BookedRange = { date: string; startMin: number; endMin: number };
  const [bookedSlots, setBookedSlots] = useState<BookedRange[]>([]);
  useEffect(() => {
    const effectiveShopId = state.shopId ?? (shops.length === 1 ? shops[0]?.id : null);
    const effectiveStaffId = state.staffId;
    if (!effectiveShopId || !effectiveStaffId || effectiveStaffId === 0) {
      setBookedSlots([]);
      return;
    }
    let cancelled = false;
    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const endD = new Date(today);
    endD.setDate(endD.getDate() + 60);
    const endDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    import("@/feature/booking-link/services/getStaffBookedSlots")
      .then((m) => m.getStaffBookedSlots(effectiveShopId, effectiveStaffId, startDate, endDate))
      .then((slots) => {
        if (!cancelled) setBookedSlots(slots);
      })
      .catch(() => {
        if (!cancelled) setBookedSlots([]);
      });
    return () => { cancelled = true; };
  }, [state.shopId, state.staffId, shops]);

  const shopsInArea = state.areaId
    ? shops.filter((s) => s.area_id === state.areaId)
    : shops;
  const staffsInShop = state.shopId
    ? staffs.filter((s) => s.shop_id === state.shopId)
    : [];

  // Visibility logic: a field shows once the previous one is selected (or skipped)
  const showShop = !!state.areaId || shops.length === 1 || areas.length === 0;
  const showStaff = showShop && !!state.shopId && link.staff_mode !== 2;
  const showMenu =
    (showStaff || link.staff_mode === 2) &&
    !!state.shopId &&
    (link.staff_mode === 2 || state.staffId !== null);
  const showDateTime = showMenu && !!state.menuManageId;

  const canProceed =
    !!state.shopId &&
    !!state.menuManageId &&
    !!state.date &&
    !!state.time &&
    (link.staff_mode === 2 || state.staffId !== null);

  return (
    <div className="flex h-full flex-col">
      {/* Header + Logo */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
        {/* Shop logo — displayed when a shop is selected (or only 1 shop) */}
        {(() => {
          const logoShop =
            selectedShop ??
            (shops.length === 1 ? shops[0] : null);
          return logoShop?.logo_url ? (
            <div className="mb-2 flex justify-center">
              <img
                src={logoShop.logo_url}
                alt={logoShop.name}
                className="h-10 w-auto object-contain"
              />
            </div>
          ) : null;
        })()}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm text-gray-500"
            disabled
            aria-hidden
          >
            ‹
          </button>
          <h2 className="flex-1 text-center text-base font-medium">
            {t("formTitle")}
          </h2>
          <div className="w-4" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        {/* Step indicator */}
        <StepHeader stepNumber={1} total={3} title={t("step1Title")} />

        {/* エリア (only if multiple areas) */}
        {areas.length > 1 && (
          <SelectRow
            icon={<MapPin className="h-4 w-4" />}
            label={t("fieldArea")}
            value={selectedArea?.name ?? null}
            expanded={expandedField === "area"}
            onToggle={() =>
              setExpandedField(expandedField === "area" ? null : "area")
            }
          >
            <div className="space-y-1.5 py-2">
              {areas.map((a) => {
                const selected = state.areaId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setState({ areaId: a.id, shopId: null, staffId: null });
                      setExpandedField("shop");
                    }}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{a.name}</span>
                    {selected && (
                      <span className="text-xs text-emerald-600">{t("selected")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </SelectRow>
        )}

        {/* 店舗 */}
        {showShop && (
          <SelectRow
            icon={<MapPin className="h-4 w-4" />}
            label={t("fieldShop")}
            value={selectedShop?.name ?? null}
            expanded={expandedField === "shop"}
            onToggle={() =>
              setExpandedField(expandedField === "shop" ? null : "shop")
            }
            extraLine={
              selectedShop ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMapShop(selectedShop);
                  }}
                  className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  {t("map")} {selectedShop.nearest_station_access ?? ""}
                </button>
              ) : null
            }
          >
            <div className="space-y-1.5 py-2">
              {shopsInArea.map((s) => {
                const selected = state.shopId === s.id;
                return (
                  <div key={s.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setState({
                          shopId: s.id,
                          areaId: s.area_id,
                          staffId: null,
                        });
                        setExpandedField(
                          link.staff_mode !== 2 ? "staff" : "menu"
                        );
                      }}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>{s.name}</span>
                      {selected && (
                        <span className="text-xs text-emerald-600">{t("selected")}</span>
                      )}
                    </button>
                    {selected && (
                      <button
                        type="button"
                        onClick={() => setMapShop(s)}
                        className="ml-2 flex items-center gap-1 text-[11px] text-emerald-600 hover:underline"
                      >
                        <MapPin className="h-3 w-3" /> {t("mapShowLocation")}
                      </button>
                    )}
                  </div>
                );
              })}
              {shopsInArea.length === 0 && (
                <p className="text-xs text-gray-400">{t("noShopsInArea")}</p>
              )}
            </div>
          </SelectRow>
        )}

        {/* スタッフ */}
        {showStaff && (
          <SelectRow
            icon={<User className="h-4 w-4" />}
            label={t("fieldStaff")}
            value={
              state.staffId === 0 ? t("anyStaff") : selectedStaff?.name ?? null
            }
            expanded={expandedField === "staff"}
            onToggle={() =>
              setExpandedField(expandedField === "staff" ? null : "staff")
            }
          >
            <div className="space-y-1.5 py-2">
              {link.staff_mode === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setState({ staffId: 0 });
                    setExpandedField("menu");
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                    state.staffId === 0
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span>{t("anyStaff")}</span>
                </button>
              )}
              {staffsInShop.map((s) => {
                const selected = state.staffId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setState({ staffId: s.id });
                      setExpandedField("menu");
                    }}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{s.name}</span>
                    {selected && (
                      <span className="text-xs text-emerald-600">{t("selected")}</span>
                    )}
                  </button>
                );
              })}
              {staffsInShop.length === 0 && (
                <p className="text-xs text-gray-400">{t("noStaffsInShop")}</p>
              )}
            </div>
          </SelectRow>
        )}

        {/* メニュー */}
        {showMenu && (
          <SelectRow
            icon={<Tag className="h-4 w-4" />}
            label={t("fieldMenu")}
            value={
              selectedMenu
                ? `${link.alias_menu_name ?? selectedMenu.name} ${
                    selectedMenu.price
                      ? `${selectedMenu.price.toLocaleString()}${t("yenSuffix")}`
                      : ""
                  }`.trim()
                : null
            }
            expanded={expandedField === "menu"}
            onToggle={() =>
              setExpandedField(expandedField === "menu" ? null : "menu")
            }
          >
            <div className="space-y-1.5 py-2">
              {menus.map((m) => {
                const selected = state.menuManageId === m.menu_manage_id;
                return (
                  <button
                    key={m.menu_manage_id}
                    type="button"
                    onClick={() => {
                      setState({ menuManageId: m.menu_manage_id });
                      setExpandedField("datetime");
                    }}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-left">
                      <div className="font-medium">
                        {link.alias_menu_name ?? m.name}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {m.duration}
                        {t("minutes")}{" "}
                        {m.price > 0 && `/ ¥${m.price.toLocaleString()}`}
                      </div>
                    </div>
                    {selected && (
                      <span className="text-xs text-emerald-600">{t("selected")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </SelectRow>
        )}

        {/* 希望の日時 */}
        {showDateTime && (
          <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
              <Calendar className="h-4 w-4" />
              <span className="font-medium">{t("fieldDateTime")}</span>
              {state.date && state.time && (
                <span className="ml-auto text-xs text-emerald-600">
                  {state.date.slice(5).replace("-", "/")} {state.time}
                </span>
              )}
            </div>
            <AvailabilityCalendar
              selectedDate={state.date}
              selectedTime={state.time}
              onSelect={(date, time) => setState({ date, time })}
              availability={shopAvailability}
              bookedSlots={bookedSlots}
              menuDuration={selectedMenu?.duration ?? 60}
            />
          </div>
        )}

        {!showDateTime && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <Info className="h-3 w-3" />
            {t("helpExpandNext")}
          </div>
        )}
      </div>

      {/* Footer button */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNext}
          className={`w-full rounded-full py-3.5 text-sm font-bold text-white transition-colors ${
            canProceed
              ? "bg-emerald-500 hover:bg-emerald-600"
              : "cursor-not-allowed bg-gray-300"
          }`}
        >
          {t("proceedToConfirm")}
        </button>
      </div>

      {/* Map sheet */}
      {mapShop && (
        <ShopMapSheet shop={mapShop} onClose={() => setMapShop(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function StepHeader({
  stepNumber,
  total,
  title,
}: {
  stepNumber: number;
  total: number;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-emerald-400 text-sm font-bold text-emerald-500">
        {stepNumber}
        <span className="text-[9px] text-gray-400">/{total}</span>
      </div>
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
    </div>
  );
}

function SelectRow({
  icon,
  label,
  value,
  expanded,
  onToggle,
  extraLine,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  expanded: boolean;
  onToggle: () => void;
  extraLine?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
          expanded
            ? "border-emerald-300 bg-emerald-50/40"
            : "border-gray-200 bg-white hover:bg-gray-50"
        }`}
      >
        <span className="mt-0.5 text-gray-500">{icon}</span>
        <div className="flex-1">
          {value ? (
            <>
              <div className="text-sm font-medium text-gray-900">{value}</div>
              {extraLine}
            </>
          ) : (
            <div className="text-sm text-gray-400">{label}</div>
          )}
        </div>
        <span className="text-[10px] text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <div className="mt-1 px-1">{children}</div>}
    </div>
  );
}
