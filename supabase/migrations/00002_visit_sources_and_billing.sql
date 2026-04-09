-- ============================================================
-- YOBERU - Migration 002: 来店経路 + 会計拡張 + 来店回数
-- ============================================================

-- 1. 来店経路マスタ (LINE経路 / 広告媒体)
CREATE TABLE visit_sources (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,          -- "Meta広告", "TikTok広告", "Instagram", "HP/SEO", "Google検索", "紹介", "チラシ", "通りがかり", "その他"
  sort_number INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_visit_sources_shop ON visit_sources (shop_id);

-- 2. appointments テーブル拡張
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_source_id INT REFERENCES visit_sources(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 0;           -- 来店回数 (1=初回)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32);           -- "cash", "card", "credit", "paypay", "square"
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS additional_charge INT DEFAULT 0;      -- 追加料金
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS next_reservation_id BIGINT;           -- 次回予約ID
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS line_remind_sent BOOLEAN DEFAULT FALSE;

-- 3. customers テーブル拡張
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 0;              -- 累計来店回数
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_sales INT DEFAULT 0;              -- 累計売上
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_date DATE;                   -- 最終来店日
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_visit_source_id INT;              -- 初回来店経路
ALTER TABLE customers ADD COLUMN IF NOT EXISTS default_menu_manage_id VARCHAR(64);     -- デフォルトメニュー

-- 4. 初期来店経路データ
INSERT INTO visit_sources (brand_id, shop_id, name, sort_number) VALUES
(1, 1, 'Meta広告', 1),
(1, 1, 'TikTok広告', 2),
(1, 1, 'Instagram', 3),
(1, 1, 'HP/SEO', 4),
(1, 1, 'Google検索', 5),
(1, 1, '紹介', 6),
(1, 1, 'チラシ', 7),
(1, 1, '通りがかり', 8),
(1, 1, 'その他', 99);

-- 5. updated_at trigger for visit_sources
CREATE TRIGGER set_updated_at BEFORE UPDATE ON visit_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
