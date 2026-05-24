-- ============================================================
-- YOBERU - Migration 052: appointments.booking_link_id
-- ============================================================
--
-- クリエイティブ分析タブ (getCreativeAnalysis) は
-- appointments.booking_link_id で「どの強制リンク経由で来た予約か」を
-- 辿るが、それまで appointments 側にカラムが存在せず、公開予約フォーム
-- (submitPublicBooking) でも記録していなかったため、強制リンク経由の
-- 予約が一件もマッチしない (= 分析画面が常に 0 件) 状態だった。
--
-- このマイグレーションでカラムを追加 + 既存予約は逆引きできないので
-- NULL のままにする (= 適用以降の新規予約からカウント開始)。
--
-- ※ アプリ側 (submitPublicBooking) は本マイグレーション適用後の環境では
--   booking_link_id を自動で書き込む。未適用環境ではエラーで弾かれない
--   よう、書き込みに失敗したらカラム無し版でリトライするフォールバック
--   を入れてある。

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_link_id INT REFERENCES booking_links(id);

CREATE INDEX IF NOT EXISTS idx_appointments_booking_link
  ON appointments(booking_link_id) WHERE deleted_at IS NULL;
