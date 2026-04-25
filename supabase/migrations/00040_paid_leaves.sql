-- 00040_paid_leaves.sql
--
-- 有給休暇 (年次有給休暇)。
--
-- 単位:
--   - 'full'     全休 (= 1.0 日)
--   - 'half_am'  午前半休 (= 0.5 日)
--   - 'half_pm'  午後半休 (= 0.5 日)
-- 時間単位の有給は本制度では扱わない (運用方針)。
--
-- 残数管理は paid_leave_grants (法定付与) と paid_leaves (使用) を
-- 突き合わせて算出する。
--   - 法定付与: 入社 6 ヶ月 + 出勤 80% で 10 日。以降勤続年数で逓増。
--   - 残数 = 当年度に有効な grants 合計 − 当年度に消化した paid_leaves 合計
-- 1 grant の有効期限は 2 年 (労基 39 条)。

CREATE TABLE IF NOT EXISTS paid_leaves (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  -- 'full' | 'half_am' | 'half_pm'
  leave_type VARCHAR(8) NOT NULL,
  reason TEXT,
  -- 承認状態 (申請ベース運用への拡張余地)。MVP では即時 'approved'。
  status VARCHAR(16) NOT NULL DEFAULT 'approved',
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_paid_leaves_staff_date
  ON paid_leaves (staff_id, leave_date)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'paid_leaves_type_check'
  ) THEN
    ALTER TABLE paid_leaves
      ADD CONSTRAINT paid_leaves_type_check
      CHECK (leave_type IN ('full','half_am','half_pm'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'paid_leaves_status_check'
  ) THEN
    ALTER TABLE paid_leaves
      ADD CONSTRAINT paid_leaves_status_check
      CHECK (status IN ('requested','approved','rejected'));
  END IF;
END $$;

-- 法定付与 (年次)。
-- 入社 6 ヶ月 + 出勤率 80% で 10 日付与、以降は 1 年ごとに +1〜2 日 (上限 20)。
-- granted_at: 付与日。expires_at: 失効日 (granted_at + 2 年)。
CREATE TABLE IF NOT EXISTS paid_leave_grants (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  -- 付与日 (= 基準日)
  granted_at DATE NOT NULL,
  -- 付与日数 (法定: 10 / 11 / 12 / 14 / 16 / 18 / 20)
  days NUMERIC(4,1) NOT NULL CHECK (days >= 0),
  -- 失効日 (granted_at から 2 年後)
  expires_at DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (staff_id, granted_at)
);

CREATE INDEX IF NOT EXISTS idx_paid_leave_grants_staff
  ON paid_leave_grants (staff_id, expires_at)
  WHERE deleted_at IS NULL;
