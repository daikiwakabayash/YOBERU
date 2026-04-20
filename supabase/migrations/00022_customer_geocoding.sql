-- 00022_customer_geocoding.sql
--
-- 商圏マップ (マーケティング > 商圏タブ) のための位置情報カラム。
--
-- - customers: 住所 (zip_code + address) から geocode した lat/lng。
--   初回表示時にサーバサイドで GSI (国土地理院) API を叩いて backfill。
-- - shops: 店舗位置。マップの中心 + 同心円半径の基準点として利用。
--
-- NUMERIC(9,6) は経度/緯度で 6 桁 = 約 10 cm 精度。十分。

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_shop_latlng
  ON customers (shop_id, latitude, longitude);

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;
