-- 00044_meta_ads_integration.sql
--
-- Meta (Facebook / Instagram) Graph API 連携用のテーブル群。
--
-- 設計方針:
--   1. 認証情報 (アクセストークン / アカウント ID) は店舗ごと: meta_ad_accounts
--   2. キャンペーン / アドセット / 広告のマスター: meta_campaigns
--   3. 日次のインサイト (CTR / CVR / 消化金額 等): meta_ad_insights_daily
--      → 既存の ad_spend と並べて使うのではなく、媒体別広告費は
--         insights から自動集計するソースとして使う。
--   4. 取得バッチの監査 / リトライ用: meta_sync_runs
--
-- なぜ ad_spend を残すか:
--   既存の手入力フロー (HPB / 紙チラシ / 紹介謝礼など) は API 連携不可。
--   Meta API ソース (auto) と 手入力ソース (manual) を区別して持ち、
--   集計時にどちらか一方だけを使うように切り替える。

-- ===========================================================
-- meta_ad_accounts: 店舗 × Meta 広告アカウント
-- ===========================================================
CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  shop_id INT NOT NULL REFERENCES shops(id),
  -- Meta 広告アカウント ID。"act_xxxxxxxxx" 形式。
  ad_account_id VARCHAR(64) NOT NULL,
  -- 表示名 (任意)。複数アカウント運用時の区別に。
  display_name VARCHAR(255),
  -- 長期アクセストークン (system user token を推奨。60 日有効 → refresh)。
  -- 暗号化はアプリ層で行う想定 (AES-GCM, env: META_TOKEN_ENC_KEY)。
  -- ここには encrypt 後の base64 を入れる。
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  -- どの visit_source にリンクするか (= 「メタ」)。NULL なら未紐付け。
  visit_source_id INT REFERENCES visit_sources(id),
  -- 同期間隔 (分)。 NULL or 0 で停止。
  sync_interval_min INT DEFAULT 360,
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  status SMALLINT NOT NULL DEFAULT 0, -- 0=有効 / 1=停止 / 2=失敗
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_shop
  ON meta_ad_accounts(shop_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_ad_accounts_account
  ON meta_ad_accounts(ad_account_id) WHERE deleted_at IS NULL;

-- ===========================================================
-- meta_campaigns: キャンペーン / アドセット / 広告のフラットなマスター
-- ===========================================================
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id BIGSERIAL PRIMARY KEY,
  ad_account_id BIGINT NOT NULL REFERENCES meta_ad_accounts(id),
  -- Meta 側 ID
  meta_campaign_id VARCHAR(64) NOT NULL,
  meta_adset_id VARCHAR(64),
  meta_ad_id VARCHAR(64),
  -- 表示名
  name VARCHAR(512),
  objective VARCHAR(64),
  status VARCHAR(32),
  daily_budget INT,    -- 円 (= スプール: amount は cents/円 等の 通貨単位)
  lifetime_budget INT, -- 円
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account
  ON meta_campaigns(ad_account_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_campaigns_meta_id
  ON meta_campaigns(meta_campaign_id, meta_adset_id, meta_ad_id) WHERE deleted_at IS NULL;

-- ===========================================================
-- meta_ad_insights_daily: 日次のパフォーマンス指標
-- ===========================================================
-- 1 行 = (ad_account, campaign, date) 単位。
-- アドセット / 広告レベルが要れば後で派生テーブルを足す。
CREATE TABLE IF NOT EXISTS meta_ad_insights_daily (
  id BIGSERIAL PRIMARY KEY,
  ad_account_id BIGINT NOT NULL REFERENCES meta_ad_accounts(id),
  meta_campaign_id VARCHAR(64),
  -- レポート日付 (Asia/Tokyo)
  report_date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend INT DEFAULT 0,         -- 消化金額 (円)
  reach BIGINT DEFAULT 0,
  -- Meta 側 conversion_actions (= 予約完了 等を ピクセルで取れる場合)。
  -- 取れなければ NULL のまま、CVR は appointments 側から算出する。
  conversions INT,
  -- 計算済み指標 (生データから派生。書込時に確定)
  cpm NUMERIC(12, 2),  -- 円
  cpc NUMERIC(12, 2),  -- 円
  ctr NUMERIC(6, 4),   -- 0..1
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meta_insights_account_date
  ON meta_ad_insights_daily(ad_account_id, report_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_insights_natural
  ON meta_ad_insights_daily(ad_account_id, meta_campaign_id, report_date);

-- ===========================================================
-- meta_sync_runs: 同期 cron の実行履歴 (デバッグ用)
-- ===========================================================
CREATE TABLE IF NOT EXISTS meta_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  ad_account_id BIGINT NOT NULL REFERENCES meta_ad_accounts(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  rows_upserted INT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending / ok / error
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_meta_sync_runs_account
  ON meta_sync_runs(ad_account_id, started_at DESC);
