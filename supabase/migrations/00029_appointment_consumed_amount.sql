-- 00029_appointment_consumed_amount.sql
--
-- 「消化売上」を扱うためのカラム追加。
--
-- 背景:
--   回数券・サブスクは会計時にまとまった額を前金として受け取るが、
--   実際にサービスが提供された (=チケット 1 回を使った) タイミングで
--   「消化売上」として別建てで認識したい。migration 00020 で
--   customer_plans / consumed_plan_id / used_count は整備済みだが、
--   金額側の記録がないので sales/marketing 画面で集計できない。
--
-- このマイグレーションは appointments に 1 予約あたりの消化額を
-- 保存する列を 1 本追加するだけ。金額のロジックは app 側で扱う。
--
-- 計算ルール:
--   * ticket       : price_snapshot / total_count を floor で配分し、
--                    最終回 (used_count 遷移後が total_count と一致)
--                    だけ残り (price_snapshot - floor × (total_count-1))
--                    を乗せて合計が price_snapshot とピタリ一致する。
--   * subscription : price_snapshot / total_count を毎回 floor で計上。
--                    total_count は menus.ticket_count を継承
--                    (サブスクの「月あたり利用回数」)。
--                    total_count が NULL の無制限サブスクは 0 を記録。
--
-- 会計額 (appointments.sales) は従来通り「当日の入金額」。
-- consumed_amount は「当日サービスが消化された金額」であり、
-- 両者は別概念。両方 0 の日もある (無料メニューで消化対象なし 等)。

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS consumed_amount INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN appointments.consumed_amount IS
  '当予約で消化したプラン金額 (円)。前金で受け取ったチケット/サブスクを'
  '実際に使った時点で認識される「消化売上」。sales (当日入金) とは別軸。';

-- 集計クエリ (sum(consumed_amount) by month/shop) を高速化
CREATE INDEX IF NOT EXISTS idx_appointments_consumed_amount
  ON appointments (shop_id, start_at)
  WHERE consumed_amount > 0 AND deleted_at IS NULL;
