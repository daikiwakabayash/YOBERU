-- ============================================================
-- YOBERU - Migration 004: リマインドメール設定 + 送信ログ
-- ============================================================

-- 1. booking_links に reminder_settings カラムを追加
-- 構造:
-- [
--   {
--     "type": "email" | "sms" | "line",
--     "offset_days": 3,          -- 予約の N 日前
--     "send_time": "08:00",      -- 送信時刻 (ローカル時刻)
--     "template": "ご予約{days}日前のお知らせ【{shop_name}】",
--     "subject": "【{shop_name}】ご予約のお知らせ",
--     "enabled": true
--   },
--   ...
-- ]
ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS reminder_settings JSONB DEFAULT '[]'::jsonb;

-- 2. リマインド送信ログ (既送信を追跡して重複送信を防ぐ)
CREATE TABLE IF NOT EXISTS reminder_logs (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL,
  booking_link_id INT,
  type VARCHAR(16) NOT NULL,       -- "email" | "sms" | "line"
  offset_days INT NOT NULL,        -- 何日前送信か
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(16) DEFAULT 'sent', -- "sent" | "failed" | "skipped"
  error_message TEXT,
  UNIQUE (appointment_id, type, offset_days)
);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_appointment
  ON reminder_logs (appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at
  ON reminder_logs (sent_at);
