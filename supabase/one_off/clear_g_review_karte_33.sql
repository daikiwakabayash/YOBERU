-- one_off_clear_g_review_karte_33.sql
--
-- 一回限りの手動修正用 SQL。
-- 5/4 に新規管理タブから誤タップで G 口コミ取得済になってしまった
-- カルテ #33 (田中競) の Google 口コミフラグをクリアする。
--
-- 実行方法:
--   1. Supabase ダッシュボード → SQL Editor
--   2. 下記 UPDATE を貼り付け、実行
--   3. 1 行更新されたことを確認 (UPDATE 1 表示)
--
-- 注意:
--   migration ではないので supabase/migrations/ には置かない。
--   再実行しても冪等 (既に NULL なら何も起こらない)。

UPDATE customers
SET google_review_received_at = NULL
WHERE code = '33'
  AND last_name = '田中'
  AND first_name = '競'
  AND deleted_at IS NULL;
