-- 00030_line_two_way_chat.sql
--
-- LINE 公式アカウント双方向チャットの基盤。
--
-- 顧客からの受信メッセージ (webhook の message イベント) と、
-- スタッフ / 自動送信 (リマインド・予約確認・問診票案内など) の送信
-- メッセージを同じ `line_messages` テーブルに保存する。
--
-- ダッシュボード `/line-chat` 画面はこのテーブルを顧客単位で取りだし、
-- チャット UI として表示する。
--
-- 友だち追加 URL / basic ID を shops に追加することで、予約完了ページや
-- 各種誘導に店舗ごとの公式アカウント追加導線を貼れるようにする。

-- ---------------------------------------------------------------------------
-- 1. line_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS line_messages (
  id BIGSERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,

  -- customers.line_user_id と一致する Messaging API userId
  line_user_id VARCHAR(64) NOT NULL,

  -- 'inbound' = 顧客から店舗へ / 'outbound' = 店舗から顧客へ
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- 'text' / 'image' / 'sticker' / 'location' / 'system' など
  message_type VARCHAR(24) NOT NULL DEFAULT 'text',

  -- テキスト本文。image/sticker の場合は null または補足テキスト
  text TEXT,

  -- LINE 側の一意 id (webhook では event.message.id / push では応答に無い)
  line_message_id VARCHAR(64),

  -- 送信者 (outbound 時のスタッフ)。自動送信 (cron/action) なら null
  sent_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,

  -- どこから送られたか: 'webhook' / 'reminder' / 'booking_confirm'
  --   / 'reengagement' / 'questionnaire' / 'chat_reply'
  source VARCHAR(32),

  -- 管理画面で既読にした時刻 (inbound のみ利用)
  read_at TIMESTAMPTZ,

  -- 送信結果 (outbound のみ): success / failed
  delivery_status VARCHAR(16),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_line_messages_shop_customer
  ON line_messages (shop_id, customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_line_messages_line_user
  ON line_messages (line_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_line_messages_inbound_unread
  ON line_messages (shop_id, created_at DESC)
  WHERE direction = 'inbound' AND read_at IS NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. shops に友だち追加 URL と basic ID
-- ---------------------------------------------------------------------------
-- line_basic_id は "@xxxxxxxx" 形式 (LINE 公式アカウントの basic ID)
-- line_add_friend_url は QR / ボタンから飛ばす先の URL
-- https://line.me/R/ti/p/@<basic_id> 形式。
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS line_basic_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS line_add_friend_url VARCHAR(256);
