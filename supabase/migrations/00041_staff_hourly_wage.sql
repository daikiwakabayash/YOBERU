-- 00041_staff_hourly_wage.sql
--
-- 残業代の法定計算用に、正社員の時給ベース (hourly_wage) と
-- 1 日所定労働時間 (standard_work_hours_per_day) を staffs に追加。
--
-- 月給制でも残業計算には時給換算が必要なので、本部が「月給 ÷
-- (所定労働日数 × 所定労働時間)」で求めた値を入れる。空欄なら
-- payroll service が monthly_min_salary / 160h でフォールバック。

ALTER TABLE staffs
  ADD COLUMN IF NOT EXISTS hourly_wage INT,
  ADD COLUMN IF NOT EXISTS standard_work_hours_per_day NUMERIC(4,2)
    NOT NULL DEFAULT 8.00;
