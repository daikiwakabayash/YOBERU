-- 00012_slot_block_types_master.sql
--
-- 予約表の「枠ブロック」(ミーティング / その他 / 休憩 / 任意のユーザー
-- 定義) をマスター管理するためのテーブル + 既存 appointments の付け
-- 替え。
--
-- 設計:
--   appointments.type          = 0    → 通常予約 (お客様の施術)
--   appointments.type          != 0   → 枠ブロック (非施術。集計から除外)
--   appointments.slot_block_type_code → 'meeting' / 'other' / 'break' / 任意
--
-- type は「お客様か否か」の軸だけに絞り、具体的な枠ブロックの種類は
-- slot_block_type_code で表現する。こうしておくとマスター側でユーザー
-- が新しい code を追加するだけで新しい種類がサポートできる (マイグレ
-- ーション不要)。
--
-- 集計サービスは `type = 0` フィルタ 1 本で済むようになる (以前の
-- "type 1 or 2" ハードコードはなくなる)。

-- ---------------------------------------------------------------------------
-- 1. slot_block_types マスター
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slot_block_types (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL,
  code VARCHAR(32) NOT NULL,
  label VARCHAR(64) NOT NULL,
  color VARCHAR(9) DEFAULT '#9333ea',
  label_text_color VARCHAR(9) DEFAULT '#ffffff',
  sort_number INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_slot_block_types_brand_code_active
  ON slot_block_types (brand_id, code)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON slot_block_types;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON slot_block_types
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. appointments.slot_block_type_code
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS slot_block_type_code VARCHAR(32);

-- Backfill the legacy hardcoded type values so every existing slot-block
-- row has a code and renders correctly in the new calendar.
UPDATE appointments
  SET slot_block_type_code = 'meeting'
  WHERE type = 1 AND slot_block_type_code IS NULL;

UPDATE appointments
  SET slot_block_type_code = 'other'
  WHERE type = 2 AND slot_block_type_code IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Seed: brand_id = 1 に 3 種類を投入
--     休憩 / ミーティング / その他
--    マスター画面からユーザーが追加・編集・カラー変更できる。
-- ---------------------------------------------------------------------------
INSERT INTO slot_block_types (
  brand_id, code, label, color, label_text_color, sort_number
) VALUES
  (1, 'meeting', 'ミーティング', '#9333ea', '#ffffff', 1),
  (1, 'other',   'その他',       '#0ea5e9', '#ffffff', 2),
  (1, 'break',   '休憩',         '#f59e0b', '#ffffff', 3)
ON CONFLICT DO NOTHING;
