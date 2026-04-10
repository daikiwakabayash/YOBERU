-- ============================================================
-- YOBERU - Migration 003: 予約リンク（強制リンク）+ 支払方法マスター
-- ============================================================

-- 1. 支払方法マスター
CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  code VARCHAR(32) NOT NULL,              -- "cash", "credit", "paypay", etc
  name VARCHAR(32) NOT NULL,              -- "現金", "クレジット", "PayPay"
  sort_number INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_shop ON payment_methods (shop_id);

-- 初期データ
INSERT INTO payment_methods (brand_id, shop_id, code, name, sort_number) VALUES
(1, 1, 'cash', '現金', 1),
(1, 1, 'credit', 'クレジット', 2),
(1, 1, 'paypay', 'PayPay', 3),
(1, 1, 'hpb_point', 'HPBポイント', 4)
ON CONFLICT DO NOTHING;

-- 2. 予約リンク（強制リンク）マスター
CREATE TABLE IF NOT EXISTS booking_links (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT,                            -- NULL = 全店舗選択可
  slug VARCHAR(64) NOT NULL UNIQUE,       -- URLパス (例: "tokyo1.meta.katakori")
  title VARCHAR(128) NOT NULL,            -- 管理タイトル (例: "東京①：META 肩こり¥2000")
  memo TEXT,                              -- 管理メモ
  language VARCHAR(8) DEFAULT 'ja',       -- "ja", "en"
  menu_manage_ids JSONB DEFAULT '[]'::jsonb,  -- 選択可能なメニューIDの配列
  alias_menu_name VARCHAR(128),           -- メニュー別名表示
  staff_mode SMALLINT DEFAULT 0,          -- 0=スタッフ指名可, 1=指名orお任せ, 2=お任せのみ
  require_cancel_policy BOOLEAN DEFAULT TRUE,
  cancel_policy_text TEXT,
  show_line_button BOOLEAN DEFAULT FALSE,
  line_button_text TEXT,
  line_button_url VARCHAR(512),
  visit_source_id INT REFERENCES visit_sources(id),  -- 媒体選択1 (流入元の自動紐付け)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_booking_links_brand ON booking_links (brand_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_slug ON booking_links (slug);

-- updated_at triggers (idempotent: drop if exists, then create)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON payment_methods;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_methods
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    DROP TRIGGER IF EXISTS set_updated_at ON booking_links;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON booking_links
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
