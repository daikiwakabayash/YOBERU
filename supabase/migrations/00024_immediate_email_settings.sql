-- 00024_immediate_email_settings.sql
--
-- 予約完了直後に送信する「即時リマインドメール」の設定を booking_links
-- に追加。
--
-- 背景:
-- リマインド設定 (reminder_settings JSONB) は「N 日前に送る」という
-- スケジュール型のみで、予約が入った瞬間に受信する予約確認メールが
-- なかった。Gmail / Yahoo 2024 基準を満たすよう Resend + SPF / DKIM /
-- DMARC で送るが、メール本文は強制リンクごとにカスタマイズできる
-- ようにする (NULL 時はコード側の日本語デフォルトを使用)。
--
-- 追加カラム:
--   - immediate_email_enabled  BOOLEAN : 即時メールを送るかどうか (既定 TRUE)
--   - immediate_email_subject  TEXT    : 件名テンプレート (NULL = デフォルト)
--   - immediate_email_template TEXT    : 本文テンプレート (NULL = デフォルト)

ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS immediate_email_enabled  BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS immediate_email_subject  TEXT,
  ADD COLUMN IF NOT EXISTS immediate_email_template TEXT;
