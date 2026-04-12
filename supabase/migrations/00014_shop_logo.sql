-- 00014_shop_logo.sql
--
-- 店舗ロゴ URL。Supabase Storage に格納した画像の公開 URL を保持する。
-- 公開予約フォームのヘッダーに表示される。

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
