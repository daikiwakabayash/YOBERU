-- 00036_allowance_defaults.sql
--
-- 諸手当のデフォルト金額・メモ保持。
--
-- 運用上「同じジムに通っている健康手当」「3万円固定の紹介手当」など、
-- 毎月同じ金額・同じメモを入力するケースが多い。それを毎月手で打ち
-- 直すのは手間なので、スタッフ × 手当種別 ごとに「デフォルト値」を
-- 1 行保持する。
--
-- 入力フォーム側の動き:
--   1. 開いたとき、enabled=true のデフォルト行があれば amount/note を
--      自動 prefill (= 「ゼロから入力」ではなく前回保存値が入る)。
--   2. 「デフォルトとして保存する」チェックを on のまま登録すると、
--      この行に upsert される。
--   3. チェックを off にすると enabled=false に倒れ、次月の form は
--      空白に戻る (=「これまで通り 0 円・空メモ から入力」)。
--
-- (staff_id, allowance_type) で一意。auto 型 (children/birthday/beauty/
-- housing) は staff 操作で入力しないのでここには現れない。

CREATE TABLE IF NOT EXISTS allowance_defaults (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  allowance_type VARCHAR(32) NOT NULL,
  amount INT NOT NULL CHECK (amount >= 0),
  note TEXT,
  -- false に倒すと次月以降の prefill を停止する
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, allowance_type)
);

CREATE INDEX IF NOT EXISTS idx_allowance_defaults_staff
  ON allowance_defaults (staff_id, enabled);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'allowance_defaults_type_check'
  ) THEN
    ALTER TABLE allowance_defaults
      ADD CONSTRAINT allowance_defaults_type_check
      CHECK (allowance_type IN (
        'study','event_access',
        'health',
        'beauty','family','commute','accommodation',
        'referral','recruit','health_check','relocation','dental'
      ));
  END IF;
END $$;
