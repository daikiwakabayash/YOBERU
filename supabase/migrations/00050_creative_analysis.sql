-- ============================================================
-- YOBERU - Migration 050: クリエイティブ分析基盤
-- ============================================================
--
-- マーケティングの「症状 × オファー価格 × 店舗」軸で CPA / 入会率 /
-- キャンセル率を集計するための拡張。運用フローは:
--   1. クリエイティブ (Meta 広告動画/画像) ごとに booking_links を 1 つ作成
--   2. その強制リンクに symptom / offer_price / shop_id を入れる
--   3. 広告セットの URL に「その強制リンク」のみを設定
--   4. 月初に ad_spend を強制リンク単位で入力
--   5. マーケティング → 「クリエイティブ分析」タブで自動集計
--
-- 既存運用への影響:
--   - すべて NULL 許可カラムなので、既存 booking_links / ad_spend は
--     そのまま動く
--   - 旧来通り「媒体単位の広告費」も入力可能 (booking_link_id = NULL)

-- 1. creative_symptoms マスター
--    UI のドロップダウンに使う。code は強制リンク側で参照。
CREATE TABLE IF NOT EXISTS creative_symptoms (
  code VARCHAR(32) PRIMARY KEY,           -- 'jiritsu', 'kataKori' 等
  name VARCHAR(64) NOT NULL,              -- '自律神経', '肩こり'
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 基本症状を seed
INSERT INTO creative_symptoms (code, name, sort_number) VALUES
  ('jiritsu',     '自律神経',     1),
  ('kataKori',    '肩こり',       2),
  ('zutsu',       '頭痛',         3),
  ('koshi',       '腰痛',         4),
  ('hizamake',    '膝痛',         5),
  ('fumin',       '不眠',         6),
  ('hieshou',     '冷え性',       7),
  ('sanngo',      '産後',         8),
  ('bijiri',      '美容矯正',     9),
  ('other',       'その他',     99)
ON CONFLICT (code) DO NOTHING;

-- 2. booking_links にクリエイティブ属性を追加
ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS symptom        VARCHAR(32) REFERENCES creative_symptoms(code),
  ADD COLUMN IF NOT EXISTS offer_price    INT,
  ADD COLUMN IF NOT EXISTS creative_memo  TEXT,
  ADD COLUMN IF NOT EXISTS parent_link_id INT REFERENCES booking_links(id);

CREATE INDEX IF NOT EXISTS idx_booking_links_symptom
  ON booking_links(symptom) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_links_offer_price
  ON booking_links(offer_price) WHERE deleted_at IS NULL;

-- 3. ad_spend に booking_link_id を追加
--    NULL = 従来通り 媒体全体の広告費
--    NOT NULL = 特定の強制リンク (= クリエイティブ) の広告費
ALTER TABLE ad_spend
  ADD COLUMN IF NOT EXISTS booking_link_id INT REFERENCES booking_links(id);

CREATE INDEX IF NOT EXISTS idx_ad_spend_booking_link
  ON ad_spend(booking_link_id) WHERE deleted_at IS NULL;

-- ad_spend の一意キーを (shop, month, visit_source, booking_link) に拡張。
-- 旧 (shop, year_month, visit_source_id) の一意制約は維持できないので、
-- まず削除してから新しい UNIQUE INDEX を貼り直す。
-- NULLS NOT DISTINCT が PG 15 以降なので、ここでは partial unique index
-- パターンを 2 本貼って NULL とそれ以外を別キーとして扱う。
DROP INDEX IF EXISTS uniq_ad_spend_shop_source_month;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ad_spend_per_link
  ON ad_spend(shop_id, year_month, visit_source_id, booking_link_id)
  WHERE deleted_at IS NULL AND booking_link_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ad_spend_per_source
  ON ad_spend(shop_id, year_month, visit_source_id)
  WHERE deleted_at IS NULL AND booking_link_id IS NULL;

-- updated_at トリガ (creative_symptoms)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON creative_symptoms;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON creative_symptoms
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
