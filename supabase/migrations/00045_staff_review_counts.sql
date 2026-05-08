-- 00045_staff_review_counts.sql
--
-- スタッフ × 月 の口コミ獲得数を手入力で記録するテーブル。
--
-- 既存の customers.google_review_received_at は「顧客が口コミを書いてくれたか」
-- の真偽値で、書いた本人 → どの担当スタッフが起点だったかを暗黙には
-- 紐付けない。スタッフ評価 / インセンティブを正確に出すには、店舗側で
-- 「今月この担当が G口コミ N件、H口コミ M件 もらった」を直接入力できる
-- 別軸のカウンターが必要。本テーブルがそれ。
--
-- 月単位で 1 行 (staff × shop × year_month で UNIQUE)。再入力で上書き。

CREATE TABLE IF NOT EXISTS staff_review_counts (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  shop_id INT NOT NULL REFERENCES shops(id),
  staff_id INT NOT NULL REFERENCES staffs(id),
  -- 'YYYY-MM'
  year_month CHAR(7) NOT NULL,
  google_count INT NOT NULL DEFAULT 0,
  hotpepper_count INT NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_review_counts
  ON staff_review_counts(staff_id, year_month)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_review_counts_shop_month
  ON staff_review_counts(shop_id, year_month)
  WHERE deleted_at IS NULL;
