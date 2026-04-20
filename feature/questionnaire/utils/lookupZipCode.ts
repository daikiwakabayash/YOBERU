/**
 * 郵便番号 → 住所 の変換ユーティリティ。
 *
 * zipcloud (https://zipcloud.ibsnet.co.jp/doc/api) の無料 API を利用。
 *   - API キー不要・CORS 許可済みでブラウザから直接叩ける
 *   - 国土地理院 (GSI) より住所フォーマットが日本郵便準拠で、フォーム
 *     補完用途に適している
 *   - 既存の feature/catchment/services/geocodeAddress.ts は lat/lng
 *     を返す用途 (地図ピン) 向けで戻り値型が違うので役割分離
 *
 * 返り値: "東京都新宿区西新宿" のような 1 行文字列 / 失敗時は null。
 * タイムアウト / ネット断 / 該当なしは静かに null を返し、UX は壊さない。
 */
export async function lookupZipCodeAddress(
  zipCode: string
): Promise<string | null> {
  const digits = zipCode.replace(/[^0-9]/g, "");
  if (digits.length !== 7) return null;

  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: number;
      results?: Array<{
        address1: string;
        address2: string;
        address3: string;
      }> | null;
    };
    const first = json.results?.[0];
    if (!first) return null;
    return `${first.address1 ?? ""}${first.address2 ?? ""}${first.address3 ?? ""}`;
  } catch {
    return null;
  }
}
