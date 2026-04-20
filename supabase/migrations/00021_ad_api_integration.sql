-- 00021_ad_api_integration.sql
--
-- Meta広告 / TikTok広告 API 連携の基盤マイグレーション。
--
-- 1. ad_spend テーブルに広告レポート指標を追加
--    (impressions, clicks, ctr, cvr, cpm, conversions, source, synced_at)
--    既存の amount 列はそのまま「消化金額」として利用。
-- 2. shops に Meta / TikTok の API トークンを保管するカラムを追加。
--    LINE 連携 (00013) と同じパターンの平文保存。本番では Vault や
--    環境変数経由で安全管理することを推奨 (docs/ad-api-integration.md 参照)。
-- 3. visit_sources に platform_type / platform_account_id を追加し、
--    どの来店経路がどの Meta 広告アカウント / TikTok advertiser に
--    紐付くかを管理する。
-- 4. ad_sync_logs テーブルを新設して、同期成否 / エラー / 取得件数
--    を記録 (debug 用)。
--
-- All statements are idempotent (IF NOT EXISTS / ALTER ... IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- 1. ad_spend に広告レポート指標を追加
-- ---------------------------------------------------------------------------
ALTER TABLE ad_spend
  ADD COLUMN IF NOT EXISTS impressions BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions BIGINT NOT NULL DEFAULT 0,
  -- ctr / cvr / cpm は API 提供値をそのまま保存。手動入力時は NULL のまま。
  -- 1.0 = 100% (Meta API 既定の比率) ではなく百分率値 (例: 2.34 = 2.34%)
  -- で保存する。Meta も TikTok も「2.34」のような値を返すため。
  ADD COLUMN IF NOT EXISTS ctr NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS cvr NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS cpm NUMERIC(12,2),
  -- どこから入力されたか。'manual' = 旧来の手動入力 / 'meta' / 'tiktok'
  -- = それぞれの API sync。同じ (shop, source, month) に対して 1 行
  -- なので、後の sync が前の手動入力を上書きする (UI 警告で説明)。
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. shops に Meta / TikTok の API 認証情報カラムを追加
-- ---------------------------------------------------------------------------
ALTER TABLE shops
  -- Meta Marketing API
  ADD COLUMN IF NOT EXISTS meta_ad_account_id VARCHAR(64),    -- 例: act_1234567890
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,            -- システムユーザートークン (長期)
  -- TikTok Marketing API
  ADD COLUMN IF NOT EXISTS tiktok_advertiser_id VARCHAR(64),  -- 数値の advertiser_id
  ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT;          -- 長期 access_token

-- ---------------------------------------------------------------------------
-- 3. visit_sources に Platform 紐付け情報を追加
-- ---------------------------------------------------------------------------
ALTER TABLE visit_sources
  -- 'meta' / 'tiktok' / NULL (=manual / organic)
  ADD COLUMN IF NOT EXISTS platform_type VARCHAR(16),
  -- Meta の場合は campaign_id (任意, 空なら ad_account 全体), TikTok の場合は ad_id 等。
  -- NULL なら shops 側の ad_account / advertiser 全体の集計をそのまま流し込む。
  ADD COLUMN IF NOT EXISTS platform_account_id VARCHAR(128);

-- 既存の seed (Meta広告 / TikTok広告) に platform_type を後付け
UPDATE visit_sources SET platform_type = 'meta'   WHERE name = 'Meta広告'   AND platform_type IS NULL;
UPDATE visit_sources SET platform_type = 'tiktok' WHERE name = 'TikTok広告' AND platform_type IS NULL;

-- ---------------------------------------------------------------------------
-- 4. ad_sync_logs テーブル
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL,
  platform VARCHAR(16) NOT NULL,             -- 'meta' | 'tiktok'
  status VARCHAR(16) NOT NULL,               -- 'success' | 'failed'
  fetched_rows INT DEFAULT 0,                -- 取得した日付分の件数
  error_message TEXT,
  triggered_by VARCHAR(16) DEFAULT 'cron',   -- 'cron' | 'manual'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ad_sync_logs_shop_started
  ON ad_sync_logs (shop_id, started_at DESC);
