-- 00013_line_messaging_integration.sql
--
-- LINE Messaging API 連携の基盤。
--
-- 1 店舗 = 1 LINE公式アカウント の運用を前提に、shops テーブルに
-- チャネル認証情報を追加する。customers にはユーザーの LINE userId
-- (友だち登録時に取得) を格納するカラムを追加する。
--
-- 注意: チャネルシークレット / アクセストークンは平文で保存される。
-- 本番環境では Supabase Vault (pgsodium) や環境変数への分離を検討。

-- ---------------------------------------------------------------------------
-- 1. shops テーブルに LINE チャネル情報
-- ---------------------------------------------------------------------------
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS line_channel_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS line_channel_secret VARCHAR(128),
  ADD COLUMN IF NOT EXISTS line_channel_access_token TEXT;

-- ---------------------------------------------------------------------------
-- 2. customers テーブルに LINE userId
-- ---------------------------------------------------------------------------
-- 既存の line_id カラム (初期スキーマ) は「顧客が自己申告した LINE ID
-- 文字列」用。今回追加する line_user_id は Messaging API の follow
-- イベントで取得する一意識別子 (U + 32hex) で、push メッセージ送信に
-- 必要。両者は用途が異なるので別カラムにする。
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_customers_line_user_id
  ON customers (line_user_id)
  WHERE line_user_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. reminder_logs テーブルに channel カラム (email / line / sms)
-- ---------------------------------------------------------------------------
-- 既存の reminder_logs は email 送信を前提に作られているため、
-- channel カラムを追加して LINE / SMS 送信も記録できるようにする。
-- デフォルト 'email' で既存行は後方互換。
ALTER TABLE reminder_logs
  ADD COLUMN IF NOT EXISTS channel VARCHAR(16) DEFAULT 'email';
