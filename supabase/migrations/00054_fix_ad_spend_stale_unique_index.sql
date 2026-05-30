-- ============================================================
-- YOBERU - Migration 054: ad_spend の古いユニークインデックス除去
-- ============================================================
--
-- 背景:
--   migration 00007 は ad_spend に
--     uk_ad_spend_shop_source_month_active
--       UNIQUE (shop_id, visit_source_id, year_month) WHERE deleted_at IS NULL
--   というユニークインデックスを作成した。
--
--   migration 00050 はクリエイティブ単位 (booking_link_id) の広告費を
--   許可するため、このユニークキーを「booking_link_id を含む 2 本の
--   partial unique index」に貼り替えようとした。ところが 00050 の
--   DROP 文が誤った名前
--     DROP INDEX IF EXISTS uniq_ad_spend_shop_source_month;
--   を指定していたため、実際に存在する
--     uk_ad_spend_shop_source_month_active
--   が削除されず、古い制約が残り続けていた。
--
-- 症状:
--   古い uk_ad_spend_shop_source_month_active は booking_link_id を
--   無視して (shop, source, month) で一意性を強制する。そのため、
--   既に「媒体単位 (booking_link_id IS NULL)」の行がある (shop, source,
--   month) に対して「強制リンク単位 (booking_link_id IS NOT NULL)」の
--   広告費を保存しようとすると duplicate key エラーになり、UI 上は
--   「広告費テーブルが未作成です」という誤った案内が出ていた。
--
-- 対応:
--   1. 古いユニークインデックスを正しい名前で削除する。
--   2. 00050 が想定していた 2 本の partial unique index を idempotent に
--      貼り直す (00050 未適用 / 部分適用の環境でも安全に通るよう、
--      booking_link_id カラムも IF NOT EXISTS で確保する)。
--
-- すべて IF EXISTS / IF NOT EXISTS で冪等。

-- 0. booking_link_id カラムを保証 (00050 が未適用でもこの後の index 作成が通るように)
ALTER TABLE ad_spend
  ADD COLUMN IF NOT EXISTS booking_link_id INT REFERENCES booking_links(id);

CREATE INDEX IF NOT EXISTS idx_ad_spend_booking_link
  ON ad_spend(booking_link_id) WHERE deleted_at IS NULL;

-- 1. 00050 が消し損ねた古いユニークインデックスを削除
DROP INDEX IF EXISTS uk_ad_spend_shop_source_month_active;
-- 00050 が DROP しようとした(が存在しなかった)名前も念のため除去
DROP INDEX IF EXISTS uniq_ad_spend_shop_source_month;

-- 2. 正しい 2 本の partial unique index を貼り直す
--    - 強制リンク単位: (shop, month, source, booking_link) where booking_link_id IS NOT NULL
--    - 媒体単位      : (shop, month, source)                where booking_link_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ad_spend_per_link
  ON ad_spend(shop_id, year_month, visit_source_id, booking_link_id)
  WHERE deleted_at IS NULL AND booking_link_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ad_spend_per_source
  ON ad_spend(shop_id, year_month, visit_source_id)
  WHERE deleted_at IS NULL AND booking_link_id IS NULL;
