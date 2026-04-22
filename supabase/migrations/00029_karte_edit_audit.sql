-- 00029_karte_edit_audit.sql
--
-- カルテ (appointments.customer_record) を会計後に編集した履歴を
-- 追跡する。誰がいつ最後に編集したかを日ごとのカルテ右下に表示する。
--
-- どのアカウントからのアクセスかは Supabase Auth のログイン
-- メールアドレスをそのまま文字列で記録する (users テーブルへの
-- 紐付けが brand ごとにバラバラなので、email 1 本で確実に識別
-- できる方を採用)。

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS customer_record_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_record_updated_by VARCHAR(255);

COMMENT ON COLUMN appointments.customer_record_updated_at IS
  'カルテ (customer_record) が最後に編集された日時。会計確定時 + 以降の後編集時に更新される。';
COMMENT ON COLUMN appointments.customer_record_updated_by IS
  'カルテを最後に編集したスタッフ / 管理者のメールアドレス (Supabase Auth user.email)。';
