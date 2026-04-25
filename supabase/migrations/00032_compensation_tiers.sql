-- 00032_compensation_tiers.sql
--
-- 業務委託費の「売上 → %」テーブル。ブランドごとに保持し、本部が
-- /payroll/tiers 画面から編集できる。
--
-- 計算式 (Phase 1):
--   compensation_税込 = max(staff.monthly_min_salary, sales_税抜 × tier_pct)
--   tier_pct          = MAX(percentage WHERE sales_threshold <= sales_税抜)
--   compensation_税抜 = round(compensation_税込 / 1.1)
--
-- 例 (デフォルト seed):
--   sales_税抜 1,000,000 → tier 35%      → 350,000 (税込)
--   sales_税抜   600,000 → tier なし     → 260,000 (税込, 最低保証)
--   sales_税抜 2,000,000 → tier 45%      → 900,000 (税込)
--
-- 売上が 800k 未満のとき tier に該当行が無いので、最低保証額がそのまま
-- 報酬になる。staff 個別の monthly_min_salary がここを担う。

CREATE TABLE IF NOT EXISTS compensation_tiers (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  -- 税抜売上の閾値 (この値以上のとき percentage が適用される)
  sales_threshold INT NOT NULL,
  -- 業務委託費の % (税抜売上 × この %= 税込報酬)。0〜100 の小数 1 桁を許容。
  percentage NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (brand_id, sales_threshold)
);

CREATE INDEX IF NOT EXISTS idx_compensation_tiers_brand_threshold
  ON compensation_tiers (brand_id, sales_threshold)
  WHERE deleted_at IS NULL;

-- 既存のブランドすべてに NAORU の標準テーブルを seed として投入。
-- 既に同じ (brand_id, sales_threshold) があればスキップ (idempotent)。
INSERT INTO compensation_tiers (brand_id, sales_threshold, percentage)
SELECT b.id, t.threshold, t.pct
FROM brands b
CROSS JOIN (VALUES
  ( 800000, 33),
  ( 900000, 34),
  (1000000, 35),
  (1100000, 36),
  (1200000, 37),
  (1300000, 38),
  (1400000, 39),
  (1500000, 40),
  (1600000, 41),
  (1700000, 42),
  (1800000, 43),
  (1900000, 44),
  (2000000, 45)
) AS t(threshold, pct)
WHERE NOT EXISTS (
  SELECT 1 FROM compensation_tiers ct
  WHERE ct.brand_id = b.id AND ct.sales_threshold = t.threshold
)
AND b.deleted_at IS NULL;
