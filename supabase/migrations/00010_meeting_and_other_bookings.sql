-- 00010_meeting_and_other_bookings.sql
--
-- Support for non-treatment appointment types on the reservation
-- calendar:
--
--   type = 0  通常予約 (既存のすべてのデータ)
--   type = 1  ミーティング (スロットを一時的にブロック)
--   type = 2  その他 (テキスト自由入力 + 時間指定でスロットブロック)
--
-- ミーティング / その他 は「枠は埋まってるが施術はしていない」扱い。
-- 稼働率 (getStaffUtilization) の計算では busy 分に加算せず、
-- マーケティング / 売上 分析からも除外する。
--
-- 追加カラム:
--   appointments.other_label — その他予約のタイトル (自由入力)。通常
--                              予約・ミーティングでは NULL。
--   shops.enable_meeting_booking — ミーティング / その他ボタンを予約
--                                   入力パネルに表示するかのマスター
--                                   トグル。デフォルト TRUE。

-- ---------------------------------------------------------------------------
-- 1. appointments.other_label
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS other_label VARCHAR(128);

-- ---------------------------------------------------------------------------
-- 2. shops.enable_meeting_booking
-- ---------------------------------------------------------------------------
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS enable_meeting_booking BOOLEAN DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 3. Index: exclude non-regular types from busy-time queries efficiently.
--    Most aggregation services filter type = 0 now; an index on (shop_id,
--    start_at) WHERE type = 0 lets PostgREST skip the other rows cheaply.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_regular_shop_start
  ON appointments (shop_id, start_at)
  WHERE type = 0 AND deleted_at IS NULL;
