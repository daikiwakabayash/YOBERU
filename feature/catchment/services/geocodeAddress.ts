"use server";

/**
 * 国土地理院 (GSI) のジオコーダ API を使って日本の住所を lat/lng に変換する。
 *
 *   https://msearch.gsi.go.jp/address-search/AddressSearch?q=<住所>
 *
 * - 完全無料 / API キー不要
 * - レート制限の公式明記は無いが、サーバ負荷配慮で小さい直列バッチで叩く
 * - 日本住所に特化しており、フォーマットゆらぎに強い
 *
 * 順次フォールバックして 1 つでもヒットすれば返す:
 *   1) 住所そのまま (例: "東京都豊島区南池袋1-28-1")
 *   2) 住所 + 〒郵便番号
 *   3) 〒郵便番号のみ (住所が壊れているとき)
 *   4) 住所の番地以下を削った形 (例: "東京都豊島区南池袋")
 */

interface GsiResult {
  geometry?: { coordinates?: [number, number] }; // [lng, lat]
  properties?: { title?: string };
}

export async function geocodeJapaneseAddress(
  zipCode: string | null | undefined,
  address: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  const candidates = buildCandidates(zipCode, address);
  for (const q of candidates) {
    const hit = await tryQuery(q);
    if (hit) return hit;
  }
  return null;
}

function buildCandidates(
  zipCode: string | null | undefined,
  address: string | null | undefined
): string[] {
  const list: string[] = [];
  const zipNorm = zipCode ? zipCode.replace(/[^0-9]/g, "") : "";
  const addr = (address ?? "").trim();
  if (addr) {
    list.push(addr);
    if (zipNorm.length === 7) {
      list.push(`〒${zipNorm.slice(0, 3)}-${zipNorm.slice(3)} ${addr}`);
    }
    // 番地以降を削った市区町村レベル (GSI が町名までしか持ってない地域用)
    const cityOnly = stripAddressDetail(addr);
    if (cityOnly && cityOnly !== addr) list.push(cityOnly);
  }
  if (zipNorm.length === 7) {
    list.push(`〒${zipNorm.slice(0, 3)}-${zipNorm.slice(3)}`);
  }
  return list;
}

function stripAddressDetail(addr: string): string {
  // 番地・丁目を削る雑な heuristic。 "...池袋1-28-1" → "...池袋"
  return addr.replace(/[\s ]*\d+(?:[-－]\d+)*[番地号丁目-]*\s*$/u, "").trim();
}

async function tryQuery(q: string): Promise<{ lat: number; lng: number } | null> {
  if (!q) return null;
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[geocode] non-OK ${res.status} for "${q}"`);
      return null;
    }
    const json = (await res.json()) as GsiResult[];
    const top = json[0];
    const coords = top?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      console.warn(`[geocode] no result for "${q}"`);
      return null;
    }
    const [lng, lat] = coords;
    if (!isFinite(lng) || !isFinite(lat)) return null;
    return { lat, lng };
  } catch (e) {
    console.warn(`[geocode] error for "${q}":`, e);
    return null;
  }
}
