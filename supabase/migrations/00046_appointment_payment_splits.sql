-- 00046_appointment_payment_splits.sql
--
-- 1 つの会計を複数の支払方法に分割するためのカラム。
--
-- 例: 月額サブスク ¥24,750 を Square で、初診料 ¥1,000 を 現金で、
--     という形で 1 予約で 2 行に分けたいケース。
--
-- 形式 (JSONB):
--   [
--     { "method": "square", "amount": 24750 },
--     { "method": "cash",   "amount": 1000 }
--   ]
--
-- 後方互換:
--   既存の appointments.payment_method カラムは残す。NULL or 単一支払の
--   ときは payment_splits を NULL にし、payment_method 1 値だけ使う。
--   分割が発生したときだけ payment_splits を埋める。
--   集計サービス側は「splits があればそちら、無ければ payment_method
--   + 合計金額」で読み分ける。

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

COMMENT ON COLUMN appointments.payment_splits IS
  '分割払いの内訳。形式: [{method, amount}]。NULL = 単一支払 (payment_method を使う)';
