-- 00027_reengagement_auto_send_and_attachments.sql
--
-- 2 つの機能追加をまとめる:
--   (1) 再来店促進 (migration 00026) に「自動配信 ON/OFF」フラグを追加。
--       /api/cron/reengagement が 1 日 1 回動き、auto_send_enabled=TRUE の
--       テンプレだけを対象に配信する。
--   (2) 顧客カルテへの画像 / メモ添付テーブル customer_attachments を追加。
--       Storage バケット customer-attachments は supabase Studio 側で
--       手動作成する (本 SQL では触らない)。RLS は後述の
--       00028_customer_attachments_storage_policies.sql で設定。

-- ---------------------------------------------------------------------------
-- (1) reengagement_templates.auto_send_enabled
-- ---------------------------------------------------------------------------
ALTER TABLE reengagement_templates
  ADD COLUMN IF NOT EXISTS auto_send_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN reengagement_templates.auto_send_enabled IS
  'TRUE なら毎日の cron (/api/cron/reengagement) で自動配信対象になる。FALSE は手動配信のみ。';

-- ---------------------------------------------------------------------------
-- (2) customer_attachments: カルテ添付ファイル (画像 / PDF / メモ)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_attachments (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id),
  -- 特定の施術に紐付けたい場合は appointment_id を入れる。NULL = 顧客単位のメモ。
  appointment_id INT REFERENCES appointments(id),
  -- Supabase Storage バケット customer-attachments 配下の相対パス。
  -- 例: shop_1/customer_123/2026-04-22_before.jpg
  file_path VARCHAR(512) NOT NULL,
  -- 元ファイル名 (ダウンロード時の表示用)
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  -- 'before' / 'after' / 'memo' / 'other' — UI で色分けする
  attachment_type VARCHAR(16) NOT NULL DEFAULT 'other',
  memo TEXT,
  uploaded_by_staff_id INT REFERENCES staffs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_attachments_customer
  ON customer_attachments (customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_attachments_appointment
  ON customer_attachments (appointment_id)
  WHERE deleted_at IS NULL AND appointment_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON customer_attachments;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON customer_attachments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
