-- 00033_allowance_usage.sql
--
-- Phase 2 of payroll module: 諸手当 (福利厚生) の使用記録テーブル。
--
-- 対象は「繰越あり」手当の 2 種だけ:
--   - study        : 勉強代手当 (税込売上 100 万円超で 10,000 円付与)
--   - event_access : イベントアクセス手当 (同上)
-- どちらも 1 年間繰越可、12 月末リセット。残枠 = 累積付与額 − 累積使用額。
--
-- 「繰越なし」手当 (子供 / 誕生日 / 健康 / 住宅) は条件と金額が決まり
-- きっているので DB 行を起こさず、計算サービス側で都度算出して請求書に
-- 載せる。Phase 4 で請求書発行時にスナップショットされる予定。
--
-- 付与 (accrual) は「対象月の税込売上 ≥ 100 万円」を満たした時点で
-- 自動的に発生。Phase 2 では DB 行は起こさず計算サービスで都度集計する
-- (% テーブル等の遡及変更にも追従できる)。本テーブルは「使用 (use)」
-- だけを記録する。

CREATE TABLE IF NOT EXISTS allowance_usage (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  -- 'study' | 'event_access'
  allowance_type VARCHAR(32) NOT NULL,
  -- 使用を記録した月。'YYYY-MM' (JST)。
  year_month VARCHAR(7) NOT NULL,
  -- 集計用に年もキャッシュ (12月リセットを高速に絞るため)。
  year INT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  -- 何に使ったか (任意)。Phase 3 で領収書 URL も格納予定。
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_allowance_usage_staff_year
  ON allowance_usage (staff_id, year, allowance_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allowance_usage_staff_yearmonth
  ON allowance_usage (staff_id, year_month)
  WHERE deleted_at IS NULL;

-- allowance_type を緩い enum で縛る (将来 'beauty' 等を追加しやすい)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'allowance_usage_type_check'
  ) THEN
    ALTER TABLE allowance_usage
      ADD CONSTRAINT allowance_usage_type_check
      CHECK (allowance_type IN ('study', 'event_access'));
  END IF;
END $$;
