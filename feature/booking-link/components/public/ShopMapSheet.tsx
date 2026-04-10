"use client";

import { X } from "lucide-react";
import type { PublicShop } from "./types";

interface ShopMapSheetProps {
  shop: PublicShop;
  onClose: () => void;
}

export function ShopMapSheet({ shop, onClose }: ShopMapSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header: MAP label */}
        <div className="px-12 py-3 text-xs font-medium text-gray-500">MAP</div>

        {/* Map placeholder (no actual map embed for now) */}
        <div className="mx-4 flex aspect-square items-center justify-center rounded-lg bg-gray-100">
          <span className="text-xs text-gray-400">地図（準備中）</span>
        </div>

        {/* Shop details */}
        <div className="p-4">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-3 text-xs text-gray-500">店舗</td>
                <td className="py-2 font-medium">{shop.name}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-3 text-xs text-gray-500">住所</td>
                <td className="py-2">
                  {shop.zip_code && (
                    <div className="text-xs text-gray-600">〒{shop.zip_code}</div>
                  )}
                  <div>{shop.address || "-"}</div>
                </td>
              </tr>
              {shop.nearest_station_access && (
                <tr>
                  <td className="py-2 pr-3 text-xs text-gray-500">備考</td>
                  <td className="py-2 text-sm">
                    {shop.nearest_station_access}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
