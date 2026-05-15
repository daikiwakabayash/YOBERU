-- one_off_wipe_naoru_customer_data.sql
--
-- 一回限りの手動修正用 SQL。
--
-- 「ナオル整体」(brands.id = 2) に紐付くテスト顧客データを完全削除する。
-- マスタ系 (shops / staffs / menus / business_hours / visit_sources / ad_spend
-- など) はそのまま残し、顧客に紐付いたトランザクションデータのみを
-- 物理削除 (hard delete) する。
--
-- 削除対象テーブル (上から順に依存関係の leaf → root):
--   - customer_attachments
--   - reengagement_logs
--   - agreements
--   - questionnaire_responses
--   - line_messages
--   - appointment_logs (CASCADE 対象 appointment 経由)
--   - reminder_logs    (CASCADE 対象 appointment 経由)
--   - appointments
--   - customer_plans
--   - recurring_rules
--   - pending_line_links (matched_customer_id は ON DELETE SET NULL なので
--     customers 削除時に自動でクリアされる)
--   - customers (referrer_customer_id の自己参照も先に NULL 化)
--
-- 注意:
--   - customer_attachments には Supabase Storage 上の実ファイル
--     (バケット: customer-attachments) が残る。実体ファイルの削除は
--     別途 Storage の管理画面 or CLI で行う必要がある。
--   - appointments.consumed_plan_id ↔ customer_plans.purchased_appointment_id
--     は循環 FK のため、両側を NULL 化してから削除する。
--   - 全体を 1 トランザクションでラップしている。FK 違反等で 1 つでも
--     失敗すれば ROLLBACK されるので安全。
--
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor で全部をそのまま実行。
--   実行前に冒頭の SELECT 結果でブランド名・顧客件数を必ず目視確認。
--
-- 実行後の状態:
--   - brand_id = 2 配下の customers 件数 = 0
--   - 関連トランザクション (予約 / カルテ / 回数券 / 同意書 / 添付など) も 0

BEGIN;

-- =====================================================================
-- 0. 削除前の対象確認 (目視チェック用)
-- =====================================================================
SELECT 'brand' AS kind,
       id,
       name,
       deleted_at
FROM brands
WHERE id = 2;

SELECT 'shop_ids in brand 2' AS kind,
       array_agg(id) AS shop_ids,
       count(*) AS shop_count
FROM shops
WHERE brand_id = 2
  AND deleted_at IS NULL;

SELECT 'customers in brand 2' AS kind,
       count(*) AS total,
       count(*) FILTER (WHERE deleted_at IS NULL) AS active
FROM customers
WHERE brand_id = 2;

SELECT 'appointments in brand 2 (customer-linked)' AS kind,
       count(*) AS total
FROM appointments a
JOIN customers c ON c.id = a.customer_id
WHERE c.brand_id = 2;

-- =====================================================================
-- 1. 対象 customer_id を一時テーブルに固める
-- =====================================================================
CREATE TEMP TABLE _target_customers
ON COMMIT DROP
AS
SELECT id
FROM customers
WHERE brand_id = 2;

CREATE TEMP TABLE _target_appointments
ON COMMIT DROP
AS
SELECT a.id
FROM appointments a
WHERE a.customer_id IN (SELECT id FROM _target_customers);

-- =====================================================================
-- 2. 循環 FK を解消 (appointments.consumed_plan_id ↔ customer_plans.purchased_appointment_id)
-- =====================================================================
UPDATE appointments
SET consumed_plan_id = NULL
WHERE id IN (SELECT id FROM _target_appointments)
   OR consumed_plan_id IN (
        SELECT id FROM customer_plans
        WHERE customer_id IN (SELECT id FROM _target_customers)
      );

UPDATE customer_plans
SET purchased_appointment_id = NULL
WHERE customer_id IN (SELECT id FROM _target_customers)
   OR purchased_appointment_id IN (SELECT id FROM _target_appointments);

-- =====================================================================
-- 3. 顧客の自己参照 referrer_customer_id を NULL 化
-- =====================================================================
UPDATE customers
SET referrer_customer_id = NULL
WHERE referrer_customer_id IN (SELECT id FROM _target_customers);

-- =====================================================================
-- 4. 予約に紐付くログ系 (appointment_logs / reminder_logs) を削除
-- =====================================================================
DELETE FROM appointment_logs
WHERE appointment_id IN (SELECT id FROM _target_appointments);

DELETE FROM reminder_logs
WHERE appointment_id IN (SELECT id FROM _target_appointments);

-- =====================================================================
-- 5. 顧客に直接紐付くデータを削除
-- =====================================================================
DELETE FROM customer_attachments
WHERE customer_id IN (SELECT id FROM _target_customers);

DELETE FROM reengagement_logs
WHERE customer_id IN (SELECT id FROM _target_customers);

DELETE FROM agreements
WHERE customer_id IN (SELECT id FROM _target_customers);

DELETE FROM questionnaire_responses
WHERE customer_id IN (SELECT id FROM _target_customers);

DELETE FROM line_messages
WHERE customer_id IN (SELECT id FROM _target_customers);

DELETE FROM recurring_rules
WHERE customer_id IN (SELECT id FROM _target_customers);

-- =====================================================================
-- 6. 予約本体を削除 (slot block = customer_id IS NULL は対象外)
-- =====================================================================
DELETE FROM appointments
WHERE id IN (SELECT id FROM _target_appointments);

-- =====================================================================
-- 7. 回数券 / サブスク (customer_plans) を削除
-- =====================================================================
DELETE FROM customer_plans
WHERE customer_id IN (SELECT id FROM _target_customers);

-- =====================================================================
-- 8. 顧客本体を削除
--    pending_line_links.matched_customer_id は ON DELETE SET NULL なので
--    自動でクリアされる
-- =====================================================================
DELETE FROM customers
WHERE id IN (SELECT id FROM _target_customers);

-- =====================================================================
-- 9. 結果確認
-- =====================================================================
SELECT 'after: customers in brand 2' AS kind,
       count(*) AS total
FROM customers
WHERE brand_id = 2;

SELECT 'after: appointments in brand 2' AS kind,
       count(*) AS total
FROM appointments a
JOIN shops s ON s.id = a.shop_id
WHERE s.brand_id = 2
  AND a.customer_id IS NOT NULL;

SELECT 'after: customer_plans in brand 2' AS kind,
       count(*) AS total
FROM customer_plans
WHERE shop_id IN (SELECT id FROM shops WHERE brand_id = 2);

COMMIT;
