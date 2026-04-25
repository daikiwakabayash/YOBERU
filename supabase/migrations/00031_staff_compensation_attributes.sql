-- 00031_staff_compensation_attributes.sql
--
-- Phase 1 of payroll module: 給与計算に必要な属性を staffs に追加する。
--
-- 業務委託 (contractor) と 正社員 (regular) を区別し、業務委託費と
-- 諸手当の自動計算に使う。Phase 1 の段階では業務委託のみ実装し、
-- 正社員は画面上「給与計算未対応 (Phase 6)」として表示する。
--
-- カラムの意図:
--   employment_type — 'contractor' / 'regular'
--   hired_at        — 入社日 (Phase 6 で勤続年数の自動切替に使う想定)
--   birthday        — 誕生月手当 (Phase 2) の判定 + プロフィール表示
--   children_count  — 子供手当 (1 人 5,000 円 / Phase 2) の計算用
--   monthly_min_salary — 業務委託の月次最低保証額 (税込)。
--     2 年未満なら 24 万 / 2 年以上なら 26 万 が想定運用だが、ヒアリング
--     により個別調整余地を残すため staff 単位のカラムとして持つ
--     (hired_at から自動切替はせず、本部が手動で 240000/260000 を設定)。

ALTER TABLE staffs
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(16) NOT NULL DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS hired_at DATE,
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS children_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_min_salary INT NOT NULL DEFAULT 260000;

-- employment_type を enum 風に縛る (再実行しても重複エラーにならないよう
-- pg_constraint を覗いてから追加)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staffs_employment_type_check'
  ) THEN
    ALTER TABLE staffs
      ADD CONSTRAINT staffs_employment_type_check
      CHECK (employment_type IN ('contractor', 'regular'));
  END IF;
END $$;

-- 給与計算ページで雇用形態フィルタを高速化するためのインデックス。
-- shop_id × employment_type の組み合わせで頻繁に絞り込まれる。
CREATE INDEX IF NOT EXISTS idx_staffs_shop_employment_type
  ON staffs (shop_id, employment_type)
  WHERE deleted_at IS NULL;
