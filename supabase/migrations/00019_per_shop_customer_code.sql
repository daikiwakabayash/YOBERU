-- 00019_per_shop_customer_code.sql
--
-- カルテナンバー (customers.code) を店舗別の連番に変更。
-- 新店舗では 1, 2, 3... と若い番号から始まるようにする。
--
-- 変更:
--   1. グローバル UNIQUE (customers_code_key) を削除
--   2. 店舗別 UNIQUE (shop_id, code) を追加
--      → 店舗 A と店舗 B でそれぞれ code "1" が使える

-- 1. 既存のグローバル UNIQUE を削除
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_code_key;

-- 2. 店舗別 UNIQUE を追加 (deleted_at IS NULL の部分インデックス)
-- ソフトデリートされた顧客のコードは再利用可能にする
CREATE UNIQUE INDEX IF NOT EXISTS uk_customers_shop_code_active
  ON customers (shop_id, code)
  WHERE deleted_at IS NULL;
