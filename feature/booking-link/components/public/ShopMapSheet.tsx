"use client";

import { X, ExternalLink } from "lucide-react";
import type { PublicShop } from "./types";

interface ShopMapSheetProps {
  shop: PublicShop;
  onClose: () => void;
}

/**
 * 住所から Google Maps 埋め込み URL を組み立てる。API キー不要の
 * クエリ文字列モードを使用するので、そのまま iframe に流すだけで
 * 地図が描画される。郵便番号のみ、住所のみ、どちらも空、いずれの
 * ケースにもフォールバックする。
 */
function buildMapQuery(shop: PublicShop): string | null {
  const parts: string[] = [];
  if (shop.zip_code) parts.push(`〒${shop.zip_code}`);
  if (shop.address) parts.push(shop.address);
  if (shop.name) parts.push(shop.name);
  const q = parts.join(" ").trim();
  return q.length > 0 ? q : null;
}

export function ShopMapSheet({ shop, onClose }: ShopMapSheetProps) {
  const mapQuery = buildMapQuery(shop);
  const embedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(
        mapQuery
      )}&output=embed&hl=ja`
    : null;
  const externalUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        mapQuery
      )}`
    : null;

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

        {/* Map embed — no API key required (iframe q= mode). */}
        <div className="mx-4 aspect-square overflow-hidden rounded-lg bg-gray-100">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={`${shop.name}の地図`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full w-full border-0"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-xs text-gray-400">住所が未設定です</span>
            </div>
          )}
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

          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              Google マップで開く
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
