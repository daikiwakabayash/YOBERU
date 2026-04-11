-- 00008_booking_link_multi_shop.sql
--
-- Booking links can now target one OR multiple shops. We add a JSONB
-- array column `shop_ids` rather than a junction table to keep the
-- read path simple (it follows the same pattern as the existing
-- `menu_manage_ids` JSONB column on this table).
--
-- Resolution rules at read time (see /book/[slug]/page.tsx):
--   1. shop_ids is non-empty array → only those shops
--   2. else if legacy shop_id is set → that single shop
--   3. else → all is_public shops in the brand (current "any shop"
--      behaviour)
--
-- The legacy `shop_id` column is left in place so existing rows keep
-- working without a backfill. New writes from the form go to shop_ids
-- only.
--
-- Idempotent: safe to re-run.

ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS shop_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Lightweight GIN index so we can later filter by "links pointing to
-- shop X" if needed (not used yet, but cheap to add now).
CREATE INDEX IF NOT EXISTS idx_booking_links_shop_ids
  ON booking_links USING GIN (shop_ids);
