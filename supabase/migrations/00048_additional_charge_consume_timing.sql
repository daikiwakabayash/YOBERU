-- 00048_additional_charge_consume_timing.sql
--
-- 追加料金 (additional_charge) を「今回の来店で消化扱い」にするか
-- 「次回の来店に持ち越す (前受金扱い)」かを記録する列。
--
-- 値:
--   'today'  = 当日の消化として計上
--   'next'   = 次回来店時に消化として計上 (= 当日は前受金扱い)
--   NULL     = 追加料金なし、または旧データ (互換のため 'today' とみなす)
--
-- UI 側の運用:
--   - 追加料金 > 0 かつ timing 未選択のときは「会計を確定する」を拒否
--   - 既存予約 (追加料金 0 or レガシー) はそのままで動く
--
-- 集計側の運用:
--   - getDailyReport / getSales が
--       消化売上 = sales + consumed_amount - plan_purchase_price
--                 - (timing='next' のときの additional_charge)
--                 + (前回来店で timing='next' だった分の追加料金、当該顧客の最初の後続来店分のみ)
--     で計算する。これにより「次回で消化」を選んだ ¥5,000 が、
--     その顧客の次の完了予約の日の消化売上に正しく乗る。

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS additional_charge_consume_timing VARCHAR(16);

COMMENT ON COLUMN appointments.additional_charge_consume_timing IS
  '追加料金の消化タイミング: today=当日 / next=次回 / NULL=該当なし';

-- 既存データ救済: additional_charge > 0 の予約には 'today' を入れて
-- 集計挙動を旧仕様 (= 全て当日消化) に揃える。
UPDATE appointments
SET additional_charge_consume_timing = 'today'
WHERE additional_charge_consume_timing IS NULL
  AND (additional_charge IS NOT NULL AND additional_charge > 0)
  AND deleted_at IS NULL;
