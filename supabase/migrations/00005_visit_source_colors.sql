-- ============================================================
-- YOBERU - Migration 005: 来店経路に色 + 問診票システム
-- ============================================================

-- 1. visit_sources に色カラムを追加
ALTER TABLE visit_sources
  ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#ef4444';
ALTER TABLE visit_sources
  ADD COLUMN IF NOT EXISTS label_text_color VARCHAR(7) DEFAULT '#ffffff';

-- 既存の来店経路に初期色を割り当て
UPDATE visit_sources SET color = '#2563eb' WHERE name = 'Meta広告' AND color = '#ef4444';
UPDATE visit_sources SET color = '#000000' WHERE name = 'TikTok広告' AND color = '#ef4444';
UPDATE visit_sources SET color = '#e1306c' WHERE name = 'Instagram' AND color = '#ef4444';
UPDATE visit_sources SET color = '#059669' WHERE name = 'HP/SEO' AND color = '#ef4444';
UPDATE visit_sources SET color = '#4285f4' WHERE name = 'Google検索' AND color = '#ef4444';
UPDATE visit_sources SET color = '#f59e0b' WHERE name = '紹介' AND color = '#ef4444';
UPDATE visit_sources SET color = '#8b5cf6' WHERE name = 'チラシ' AND color = '#ef4444';
UPDATE visit_sources SET color = '#6b7280' WHERE name = '通りがかり' AND color = '#ef4444';

-- ============================================================
-- 2. 問診票システム
-- ============================================================

-- 問診票テンプレート
CREATE TABLE IF NOT EXISTS questionnaires (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT,                           -- NULL = ブランド共通
  slug VARCHAR(64) NOT NULL UNIQUE,      -- 公開URLのパス (/questionnaire/<slug>)
  title VARCHAR(255) NOT NULL,
  description TEXT,                      -- トップの説明文
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- questions example:
  -- [
  --   { "id": "q1", "type": "text", "label": "お名前", "required": true, "field": "full_name" },
  --   { "id": "q2", "type": "text_kana", "label": "お名前 (カナ)", "required": true, "field": "kana" },
  --   { "id": "q3", "type": "radio", "label": "性別", "options": ["男性","女性"], "required": true, "field": "gender" },
  --   { "id": "q4", "type": "date", "label": "生年月日", "required": true, "field": "birth_date" },
  --   { "id": "q5", "type": "text", "label": "郵便番号", "required": true, "field": "zip_code" },
  --   { "id": "q6", "type": "text", "label": "住所", "field": "address" },
  --   { "id": "q7", "type": "textarea", "label": "来院動機", "field": "description" },
  --   { "id": "q8", "type": "textarea", "label": "症状・痛む場所" }
  -- ]
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_questionnaires_brand ON questionnaires (brand_id);
CREATE INDEX IF NOT EXISTS idx_questionnaires_slug ON questionnaires (slug);

-- 問診票回答
CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id BIGSERIAL PRIMARY KEY,
  questionnaire_id INT NOT NULL REFERENCES questionnaires(id),
  customer_id BIGINT,                    -- NULL許可 (顧客未登録でもOK)
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- answers example: { "q1": "山田太郎", "q3": "男性", ... }
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qresponses_questionnaire
  ON questionnaire_responses (questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_qresponses_customer
  ON questionnaire_responses (customer_id);
CREATE INDEX IF NOT EXISTS idx_qresponses_created_at
  ON questionnaire_responses (created_at DESC);

-- updated_at トリガー
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON questionnaires;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON questionnaires
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
