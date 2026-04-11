-- 00011_nullable_customer_for_slot_blocks.sql
--
-- ミーティング / その他 (type 1 / 2) の slot-block 予約は顧客に紐づか
-- ないため、`appointments.customer_id` を NULL 可に変更する。
--
-- 当初 00010 で type カラムの運用を追加したが、customer_id の NOT NULL
-- 制約を外し忘れていたため「ミーティングを入れるとエラー」という不
-- 具合に繋がっていた。本マイグレーションで修正する。
--
-- 通常予約 (type = 0) は依然として customer_id を持つので、アプリ側で
-- zod 検証 (feature/reservation/schema/reservation.schema.ts) が NULL
-- を許すのは「type が 1/2」の場合のみに限定してある。

ALTER TABLE appointments
  ALTER COLUMN customer_id DROP NOT NULL;

-- Documentation only: the FK still applies when customer_id is non-null.
COMMENT ON COLUMN appointments.customer_id IS
  'References customers(id). NULL is allowed only for type 1 (meeting) / type 2 (other) slot blocks — regular treatment appointments must still set it.';
