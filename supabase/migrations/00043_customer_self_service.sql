-- 00043_customer_self_service.sql
--
-- 顧客自身による予約閲覧 / キャンセル機能を追加するため、
-- 1) 顧客に LINE 紐付け用のユニークトークンを付与
-- 2) 店舗側で「顧客が予約変更 / キャンセル可能か」のフラグを設定
--
-- 公式 LINE 紐付けの 2 経路:
--   A) 予約完了サンクスページの「公式 LINE はこちら」ボタンから
--      → /line/link/<token> へ → LIFF で line_user_id を取得して紐付け
--   B) 電話予約等で顧客 DB から個別に発行した LINE リンク / QR を
--      顧客に LINE 経由で送付 → 同 URL で紐付け

-- =====================================================
-- customers: 顧客固有の LINE 紐付けトークン
-- =====================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS line_link_token VARCHAR(36);

CREATE UNIQUE INDEX IF NOT EXISTS uk_customers_line_link_token
  ON customers (line_link_token)
  WHERE line_link_token IS NOT NULL AND deleted_at IS NULL;

-- 既存顧客には UUID を一括発行 (将来的に new INSERT も BEFORE INSERT
-- trigger で自動生成するのが望ましいが、MVP ではアプリ層で gen する)
UPDATE customers
SET line_link_token = gen_random_uuid()::text
WHERE line_link_token IS NULL AND deleted_at IS NULL;

-- =====================================================
-- shops: 顧客セルフサービス設定
-- =====================================================
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS customer_can_cancel BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS customer_can_modify BOOLEAN NOT NULL DEFAULT FALSE,
  -- キャンセル可能な締切 (予約開始時刻の何時間前まで)
  ADD COLUMN IF NOT EXISTS customer_cancel_deadline_hours INT NOT NULL DEFAULT 24;
