-- one_off_revert_ishioka_plan66_consumption.sql
--
-- 一回限りの手動修正用 SQL。
--
-- 石岡龍佑 (customer #236, カルテ #25) は 2026-05-11 11:56 に
-- YURUMU 6回30分プラン (customer_plans #66, ¥33,000) を購入し、
-- 「次回から消化」を選択した。
--
-- しかし、同日 18:00 の予約 (#437) を「会計を確定する」した時に
-- autoConsumePlanForAppointment が「次回から消化」の意思を考慮できず
-- 同プランから自動消化してしまい、結果:
--   - plan #66 used_count = 1 (本来は 0)
--   - appointment #437 consumed_plan_id = 66, consumed_amount = 5500
-- という状態になっている。
--
-- コード側のバグは別途修正済み (autoConsumePlanForAppointment が
-- purchased_appointment_id == appointmentId のプランを候補から除外する
-- ようにした)。本 SQL は 石岡さんの過去レコードを「次回から消化」の
-- 本来あるべき状態に戻すための one-off。
--
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor で全部を 1 トランザクションで実行。
--
-- 復旧後の状態:
--   - plan #66 used_count = 0, status = 0 (active, 残 6 回)
--   - appointment #437 consumed_plan_id = NULL, consumed_amount = 0
--   - 日報の 5/11 消化売上から ¥5,500 が消える (= ¥6,050 のみに)

BEGIN;

-- 1. プランの消化回数を 0 に戻す
UPDATE customer_plans
SET used_count = 0,
    status = 0,
    updated_at = NOW()
WHERE id = 66
  AND customer_id = 236
  AND used_count = 1;

-- 2. 予約の消化リンクをクリア
UPDATE appointments
SET consumed_plan_id = NULL,
    consumed_amount = 0
WHERE id = 437
  AND consumed_plan_id = 66;

COMMIT;
