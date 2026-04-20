-- 00023_tag_templates.sql
--
-- タグテンプレート機能を追加。
--
-- 1. tag_templates テーブルを新設。ブランド単位で Google Tag Manager
--    などの任意の HTML/script タグをテンプレートとして保存する。
-- 2. booking_links に head_tag_template_id / body_tag_template_id FK を
--    追加。強制リンクごとに head と body 1 つずつテンプレートを紐付けて、
--    公開予約ページ (/book/[slug]) でクライアント側から document.head /
--    body にそれぞれ注入する。
--
-- All statements are idempotent (IF NOT EXISTS / ALTER ... IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- 1. tag_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tag_templates (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  title VARCHAR(128) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  memo TEXT,
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tag_templates_brand_active
  ON tag_templates (brand_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. booking_links に head/body タグテンプレート FK を追加
-- ---------------------------------------------------------------------------
ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS head_tag_template_id INT REFERENCES tag_templates(id),
  ADD COLUMN IF NOT EXISTS body_tag_template_id INT REFERENCES tag_templates(id);
