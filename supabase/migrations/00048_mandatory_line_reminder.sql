-- 00048_mandatory_line_reminder.sql
--
-- 強制リンク経由の初回予約に対してのみ LINE リマインドを送る運用に切り替える
-- ための DB 変更。
--
-- 背景:
-- 本番運用で、同一予約に対し複数の LINE リマインドが連続送信される誤送信が
-- 発生した。原因は (a) reminder_settings に LINE + Email が同 offset_days で
-- 共存し、cron が email エントリも LINE 経由で送ってしまっていた、
-- (b) reminder_logs の INSERT エラーが握り潰される race condition、の組合せ。
--
-- 本マイグレーションは「強制リンク経由 + 新規(初回) + LINE 紐付け済み」の
-- 3 条件を満たす予約だけを cron 対象とするために、booking_links に明示的な
-- フラグを追加する。デフォルト FALSE のため、適用直後はすべての既存リンクが
-- 対象外となり安全。
--
-- 追加カラム:
--   - is_mandatory_line BOOLEAN NOT NULL DEFAULT FALSE
--     true のとき、その booking_link 経由の予約は cron LINE リマインドの
--     対象となる (他の条件: visit_count=1 かつ customers.line_user_id NOT NULL)

ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS is_mandatory_line BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN booking_links.is_mandatory_line IS
  '強制リンク: 予約完了画面で LINE 友だち追加 LIFF を必須提示し、cron リマインドの対象とする';
