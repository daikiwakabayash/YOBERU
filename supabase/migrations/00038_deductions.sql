-- 00038_deductions.sql
--
-- スタッフごとの控除 (社会保険料 / 所得税 / 住民税 / その他) を月次で
-- 記録できるようにする。allowance_usage / allowance_defaults と
-- 同じ「使用記録 + デフォルト保存 + 固定 (enabled) チェック」パターンに
-- 揃える。
--
-- 控除種別:
--   health_insurance       — 健康保険料
--   pension                — 厚生年金保険料
--   long_term_care         — 介護保険料 (40 歳以上)
--   employment_insurance   — 雇用保険料
--   income_tax             — 所得税 (源泉)
--   resident_tax           — 住民税
--   other                  — その他 (積立金 / 社宅費 等)
--
-- 数値はすべて「正の値で控除額」(請求書の合計から差し引く側)。

CREATE TABLE IF NOT EXISTS deduction_usage (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  deduction_type VARCHAR(32) NOT NULL,
  -- YYYY-MM (例: '2026-04')
  year_month VARCHAR(7) NOT NULL,
  -- year は集計効率のため year_month から派生して持つ
  year INT NOT NULL,
  amount INT NOT NULL CHECK (amount >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deduction_usage_staff_year
  ON deduction_usage (staff_id, year)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_deduction_usage_staff_ym
  ON deduction_usage (staff_id, year_month)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deduction_usage_type_check'
  ) THEN
    ALTER TABLE deduction_usage
      ADD CONSTRAINT deduction_usage_type_check
      CHECK (deduction_type IN (
        'health_insurance','pension','long_term_care',
        'employment_insurance','income_tax','resident_tax','other'
      ));
  END IF;
END $$;

-- 「毎月固定で同じ金額」運用のためのデフォルト値保存。
-- enabled=true なら入力フォームに amount/note を prefill。
-- (staff_id, deduction_type) で 1 行制約。
CREATE TABLE IF NOT EXISTS deduction_defaults (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  deduction_type VARCHAR(32) NOT NULL,
  amount INT NOT NULL CHECK (amount >= 0),
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, deduction_type)
);

CREATE INDEX IF NOT EXISTS idx_deduction_defaults_staff
  ON deduction_defaults (staff_id, enabled);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deduction_defaults_type_check'
  ) THEN
    ALTER TABLE deduction_defaults
      ADD CONSTRAINT deduction_defaults_type_check
      CHECK (deduction_type IN (
        'health_insurance','pension','long_term_care',
        'employment_insurance','income_tax','resident_tax','other'
      ));
  END IF;
END $$;
