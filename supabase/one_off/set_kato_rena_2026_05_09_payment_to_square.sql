-- one_off_set_kato_rena_2026_05_09_payment_to_square.sql
--
-- 一回限りの手動修正用 SQL。
--
-- 5/9 加藤れな (¥18,150) の予約は、payment_method が NULL のまま残って
-- いるため日報で「未設定」枠に入っている。「更新」ボタン経由で支払方法が
-- 保存されないバグ (修正済) の影響なので、過去レコードを Square に
-- 更新する。
--
-- 実行方法:
--   1. Supabase ダッシュボード → SQL Editor
--   2. 下記 UPDATE を貼り付け、実行
--   3. 1 行更新を確認 (UPDATE 1)
--
-- 注意:
--   "square" の code は visit_sources ではなく payment_methods マスタの
--   code に依存。店舗で別 code (例: "sq" / "ス" など) を使っている場合は
--   そちらに合わせて差し替えること。下記コメントの SELECT で確認できる。
--
-- 確認用: 利用可能な支払方法コード一覧
--   SELECT code, name FROM payment_methods
--    WHERE shop_id = (SELECT shop_id FROM customers WHERE last_name = '加藤' AND first_name = 'れな')
--    AND deleted_at IS NULL;

UPDATE appointments
SET payment_method = 'square'
WHERE id = (
  SELECT a.id
  FROM appointments a
  JOIN customers c ON c.id = a.customer_id
  WHERE c.last_name = '加藤'
    AND c.first_name = 'れな'
    AND a.start_at >= '2026-05-09T00:00:00+09:00'
    AND a.start_at <  '2026-05-10T00:00:00+09:00'
    AND a.sales = 18150
    AND a.deleted_at IS NULL
  LIMIT 1
)
AND payment_method IS NULL;
