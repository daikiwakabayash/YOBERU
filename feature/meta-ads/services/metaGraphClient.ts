import "server-only";

/**
 * Meta Graph API クライアント (薄いラッパー)。
 *
 * "use server" ではなく "server-only" を使うのは、これは Server Action
 * (= async + form submit から呼べる) ではなく、サーバ側専用のフェッチ
 * ユーティリティだから。同じファイルから interface もエクスポート
 * したいので "use server" は避ける。
 *
 * このファイルは「実装済の HTTP 呼び出し」と「呼び出しに必要な型」を
 * 持つだけで、業務ロジック (DB 書き込み等) は呼び出し側の
 * syncMetaAdAccount に書く。
 *
 * 環境変数:
 *   META_GRAPH_API_VERSION  例: "v21.0"  (未設定なら "v21.0")
 *
 * トークンは meta_ad_accounts.access_token_encrypted を復号して
 * 呼び出し側で渡す。ここではトークンの扱いに関与しない。
 *
 * 実 API キー / 広告アカウントが用意されるまでは、戻り値型だけ
 * 信用して上流をモック実装で動かせるよう、I/O 関数だけ export する
 * シンプルな構成にしている。
 */

const API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export interface MetaInsightDaily {
  date_start: string; // YYYY-MM-DD
  campaign_id?: string;
  campaign_name?: string;
  impressions?: string; // Meta は文字列で返す
  clicks?: string;
  spend?: string; // 通貨単位は account の通貨に依存。日本アカウントなら円。
  reach?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

/**
 * 広告アカウントの当該期間の日次インサイトを取得。
 * 30 日 × campaign 単位で分解されるため、1 アカウント数百行は普通。
 */
export async function fetchDailyInsights(params: {
  accessToken: string;
  adAccountId: string; // "act_xxxxxxxx"
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}): Promise<MetaInsightDaily[]> {
  const { accessToken, adAccountId, since, until } = params;
  const fields = [
    "campaign_id",
    "campaign_name",
    "impressions",
    "clicks",
    "spend",
    "reach",
    "ctr",
    "cpm",
    "cpc",
    "actions",
  ].join(",");
  const url =
    `${BASE}/${encodeURIComponent(adAccountId)}/insights` +
    `?level=campaign` +
    `&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&fields=${fields}` +
    `&limit=500` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta insights fetch failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { data?: MetaInsightDaily[] };
  return json.data ?? [];
}

/**
 * 広告アカウントのキャンペーン一覧 (= マスター更新用)。
 */
export async function fetchCampaigns(params: {
  accessToken: string;
  adAccountId: string;
}): Promise<MetaCampaign[]> {
  const { accessToken, adAccountId } = params;
  const fields = [
    "id",
    "name",
    "objective",
    "status",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "stop_time",
  ].join(",");
  const url =
    `${BASE}/${encodeURIComponent(adAccountId)}/campaigns` +
    `?fields=${fields}` +
    `&limit=200` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta campaigns fetch failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { data?: MetaCampaign[] };
  return json.data ?? [];
}
