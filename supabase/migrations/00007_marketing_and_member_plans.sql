-- 00007_marketing_and_member_plans.sql
--
-- Marketing dashboard foundation. Three changes in one migration:
--
--   1. ad_spend table: monthly ad spend per (shop × media). Entered
--      manually from the /ad-spend page. One row per (shop_id,
--      year_month, visit_source_id) — re-entry is an UPSERT.
--   2. appointments.is_member_join column: a boolean the staff flips
--      from the reservation panel when the customer signs up for a
--      membership during that visit. Feeds 入会率 calculations.
--   3. Seed member plans into the menus table so they can be selected
--      as default products for 売上 and, later, tracked per customer.
--      Rows live at shop_id IS NULL (ブランド共通) so all shops share
--      them.
--
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT / etc).

-- ---------------------------------------------------------------------------
-- 1. ad_spend table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_spend (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  visit_source_id INT NOT NULL,
  year_month CHAR(7) NOT NULL,        -- 'YYYY-MM'
  amount INT NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_shop_month
  ON ad_spend (shop_id, year_month);
CREATE INDEX IF NOT EXISTS idx_ad_spend_shop_source_month
  ON ad_spend (shop_id, visit_source_id, year_month);

-- Uniqueness: (shop, media, month) — enforces the upsert contract.
-- Using a partial index so soft-deleted rows don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS uk_ad_spend_shop_source_month_active
  ON ad_spend (shop_id, visit_source_id, year_month)
  WHERE deleted_at IS NULL;

-- updated_at trigger (reuses the existing function if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON ad_spend;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON ad_spend
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. appointments.is_member_join
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS is_member_join BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_appointments_member_join
  ON appointments (shop_id, is_member_join)
  WHERE is_member_join = TRUE;

-- ---------------------------------------------------------------------------
-- 3. Seed member-plan menus (ブランド共通, shop_id IS NULL)
-- ---------------------------------------------------------------------------
-- The menus table has a composite natural key (brand_id, menu_manage_id);
-- we upsert on that. If your deployment uses multiple brands, adjust the
-- seed to iterate brands. For now we seed brand_id = 1.

-- Ensure a "会員プラン" menu_category exists for brand 1.
INSERT INTO menu_categories (brand_id, shop_id, name, sort_number)
SELECT 1, NULL, '会員プラン', 999
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories
  WHERE brand_id = 1 AND name = '会員プラン' AND deleted_at IS NULL
);

-- Now seed the plans. Prices come from the spreadsheet shared in the
-- feature request. duration = 0 for plans that aren't tied to a slot
-- (NAORUプラン is a subscription), or the minutes for body-care plans.
INSERT INTO menus (
  brand_id, shop_id, category_id, menu_manage_id, menu_type,
  name, price, duration, status, sort_number
)
SELECT
  1 AS brand_id,
  NULL AS shop_id,
  (SELECT id FROM menu_categories WHERE brand_id = 1 AND name = '会員プラン' AND deleted_at IS NULL LIMIT 1) AS category_id,
  plan.menu_manage_id,
  0 AS menu_type,
  plan.name,
  plan.price,
  plan.duration,
  1 AS status,
  plan.sort_number
FROM (VALUES
  ('BRD-PLAN-NAORU',         'NAORUプラン',         24750,   0,  1),
  ('BRD-PLAN-BODY-30',       'ボディケア30分',       6600,  30,  2),
  ('BRD-PLAN-BODY-60',       'ボディケア60分',      13200,  60,  3),
  ('BRD-PLAN-BODY-90',       'ボディケア90分',      18000,  90,  4),
  ('BRD-PLAN-YURUMU-2x30',   '2回30分 (yurumu)',    12100,  30,  5),
  ('BRD-PLAN-YURUMU-2x60',   '2回60分 (yurumu)',    24200,  60,  6),
  ('BRD-PLAN-YURUMU-3x30',   '3回30分 (yurumu)',    18150,  30,  7),
  ('BRD-PLAN-YURUMU-3x60',   '3回60分 (yurumu)',    36300,  60,  8),
  ('BRD-PLAN-YURUMU-4x30',   '4回30分 (yurumu)',    22000,  30,  9),
  ('BRD-PLAN-YURUMU-4x60',   '4回60分 (yurumu)',    44000,  60, 10),
  ('BRD-PLAN-YURUMU-6x30',   '6回30分 (yurumu)',    33000,  30, 11)
) AS plan(menu_manage_id, name, price, duration, sort_number)
WHERE NOT EXISTS (
  SELECT 1 FROM menus m
  WHERE m.brand_id = 1
    AND m.menu_manage_id = plan.menu_manage_id
    AND m.deleted_at IS NULL
);
