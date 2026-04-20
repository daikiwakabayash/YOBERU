"use server";

/**
 * 国土地理院 (GSI) のジオコーダ API を使って日本の住所を lat/lng に変換する。
 *
 *   https://msearch.gsi.go.jp/address-search/AddressSearch?q=<住所>
 *
 * - 完全無料 / API キー不要
 * - レート制限の公式明記は無いが、サーバ負荷配慮で小さい直列バッチで叩く
 * - 日本住所に特化しており、郵便番号フォーマット・都道府県名のゆらぎに強い
 *
 * 返り値: { lat, lng } | null (失敗時)
 */

interface GsiResult {
  geometry?: { coordinates?: [number, number] }; // [lng, lat]
  properties?: { title?: string };
}

export async function geocodeJapaneseAddress(
  zipCode: string | null | undefined,
  address: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  const normalized = normalize(zipCode, address);
  if (!normalized) return null;

  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(
    normalized
  )}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      // GSI 側でたまに反応が遅いので 10s でタイムアウト
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GsiResult[];
    const top = json[0];
    const coords = top?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lng, lat] = coords;
    if (!isFinite(lng) || !isFinite(lat)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function normalize(
  zipCode: string | null | undefined,
  address: string | null | undefined
): string {
  const parts: string[] = [];
  if (zipCode) {
    const zip = zipCode.replace(/[^0-9]/g, "");
    if (zip.length === 7) parts.push(`〒${zip.slice(0, 3)}-${zip.slice(3)}`);
  }
  if (address) parts.push(address.trim());
  const joined = parts.join(" ").trim();
  return joined;
}
