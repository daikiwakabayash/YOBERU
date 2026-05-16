-- one_off_wipe_naoru_seitai_customers.sql
--
-- 一回限りの手動修正用 SQL。
--
-- ブランド名 'NAORU整体' に紐付くテスト顧客データを完全削除する。
--
-- 背景:
--   既存の wipe_naoru_customer_data.sql は brand_id = 2 をハードコードしていたが、
--   実環境では NAORU整体 ブランドの id が想定と異なっており 0 件削除になっていた。
--   本 SQL は brand_id を name から動的に解決するため、id ズレに強い。
--
-- 削除対象:
--   - brands.name = 'NAORU整体' 配下の customers 全件 (SYS-BLOCK は customer ではないので影響なし)
--   - 上記 customer に紐付く appointments / customer_plans / カルテ系 / ログ系 全て
--
-- 残すもの (マスタ系):
--   - brands / shops / staffs / menus / business_hours
--   - visit_sources / payment_methods / facilities
--   - ad_spend / questionnaires (本体)
--   - SYS-BLOCK-* の slot block 予約 (customer_id IS NULL)
--
-- 注意:
--   - customer_attachments の Storage 実体ファイル (バケット: customer-attachments)
--     は別途 Storage 管理画面で削除する必要がある。
--   - appointments.consumed_plan_id ↔ customer_plans.purchased_appointment_id
--     は循環 FK のため両側を NULL 化してから削除する。
--   - 全体を 1 トランザクションでラップしている。途中で FK 違反等が起きれば
--     ROLLBACK されるので安全。
--
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor で全部をそのまま実行。
--   冒頭の SELECT で対象ブランド ID と顧客件数を必ず目視確認すること。
--   想定と異なれば COMMIT 前に手動 ROLLBACK で中止可能。
--
-- 実行後の状態:
--   - 'NAORU整体' ブランド配下の customers 件数 = 0
--   - 関連トランザクション (予約 / カルテ / 回数券 / 同意書 / 添付など) も 0

BEGIN;

-- =====================================================================
-- 0. 削除前の対象確認 (目視チェック用)
-- =====================================================================
SELECT 'target brand' AS kind,
       id,
       name,
       deleted_at
FROM brands
WHERE name = 'NAORU整体';

SELECT 'shops in target brand' AS kind,
       array_agg(id ORDER BY id) AS shop_ids,
       count(*) AS shop_count
FROM shops
WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
  AND deleted_at IS NULL;

SELECT 'customers in target brand' AS kind,
       count(*) AS total,
       count(*) FILTER (WHERE deleted_at IS NULL) AS active
FROM customers
WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1);

SELECT 'appointments linked to target brand customers' AS kind,
       count(*) AS total
FROM appointments a
WHERE a.customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

-- =====================================================================
-- 1. 循環 FK を解消
--    (appointments.consumed_plan_id ↔ customer_plans.purchased_appointment_id)
-- =====================================================================
UPDATE appointments
SET consumed_plan_id = NULL
WHERE customer_id IN (
        SELECT id FROM customers
        WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
      )
   OR consumed_plan_id IN (
        SELECT id FROM customer_plans
        WHERE customer_id IN (
          SELECT id FROM customers
          WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
        )
      );

UPDATE customer_plans
SET purchased_appointment_id = NULL
WHERE customer_id IN (
        SELECT id FROM customers
        WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
      )
   OR purchased_appointment_id IN (
        SELECT id FROM appointments
        WHERE customer_id IN (
          SELECT id FROM customers
          WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
        )
      );

-- =====================================================================
-- 2. 顧客の自己参照 referrer_customer_id を NULL 化
-- =====================================================================
UPDATE customers
SET referrer_customer_id = NULL
WHERE referrer_customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

-- =====================================================================
-- 3. 予約に紐付くログ系 (appointment_logs / reminder_logs) を削除
-- =====================================================================
DELETE FROM appointment_logs
WHERE appointment_id IN (
  SELECT id FROM appointments
  WHERE customer_id IN (
    SELECT id FROM customers
    WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
  )
);

DELETE FROM reminder_logs
WHERE appointment_id IN (
  SELECT id FROM appointments
  WHERE customer_id IN (
    SELECT id FROM customers
    WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
  )
);

-- =====================================================================
-- 4. 顧客に直接紐付くデータを削除
-- =====================================================================
DELETE FROM customer_attachments
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

DELETE FROM reengagement_logs
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

DELETE FROM agreements
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

DELETE FROM questionnaire_responses
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

DELETE FROM line_messages
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

DELETE FROM recurring_rules
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

-- =====================================================================
-- 5. 予約本体を削除 (slot block = customer_id IS NULL は対象外)
-- =====================================================================
DELETE FROM appointments
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

-- =====================================================================
-- 6. 回数券 / サブスク (customer_plans) を削除
-- =====================================================================
DELETE FROM customer_plans
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

-- =====================================================================
-- 7. 顧客本体を削除
--    pending_line_links.matched_customer_id は ON DELETE SET NULL なので
--    自動でクリアされる
-- =====================================================================
DELETE FROM customers
WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1);

-- =====================================================================
-- 8. 結果確認
-- =====================================================================
SELECT 'after: customers in target brand' AS kind,
       count(*) AS total
FROM customers
WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1);

SELECT 'after: appointments linked to target brand customers' AS kind,
       count(*) AS total
FROM appointments a
WHERE a.customer_id IN (
  SELECT id FROM customers
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

SELECT 'after: customer_plans linked to target brand shops' AS kind,
       count(*) AS total
FROM customer_plans
WHERE shop_id IN (
  SELECT id FROM shops
  WHERE brand_id = (SELECT id FROM brands WHERE name = 'NAORU整体' LIMIT 1)
);

COMMIT;
