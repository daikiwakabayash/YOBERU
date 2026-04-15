-- 00016_customer_search_indexes.sql
--
-- 予約パネルで顧客をカルテナンバーで検索したあとの過去データ取得が
-- 重かった件のインデックス追加。
--
-- ボトルネックの特定:
--   AppointmentDetailSheet で顧客を選択 → getCustomerFullDetail() が
--   appointments テーブルを customer_id で絞り込んで過去 50 件を取得する。
--   appointments テーブルには customer_id への専用インデックスが
--   なかったため、顧客を選ぶたびにフルスキャン相当の負荷が走っていた。
--
--   加えて customers テーブルの検索用カラム (code / 名前 / 電話番号)
--   にもインデックスが無く、検索キーストロークごとに shop 内全件を
--   スキャンしていた。
--
-- 全て IF NOT EXISTS で冪等。既存データは触らない。

-- ---------------------------------------------------------------------------
-- 1. appointments の customer_id インデックス  ← 最重要
--    (顧客詳細パネルを開いた時の「過去履歴取得」が激速になる)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id
  ON appointments (customer_id)
  WHERE deleted_at IS NULL;

-- カルテ (customer) 詳細で「過去の予約を start_at 降順で」取る頻度が
-- 高いので複合インデックスも追加。Postgres が適切な方を選ぶ。
CREATE INDEX IF NOT EXISTS idx_appointments_customer_start
  ON appointments (customer_id, start_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. customers の検索用インデックス
-- ---------------------------------------------------------------------------

-- (shop_id, code) 複合: 店舗内カルテナンバー検索に使う
-- 例: WHERE shop_id = ? AND code ILIKE '123%' の前方一致
CREATE INDEX IF NOT EXISTS idx_customers_shop_code
  ON customers (shop_id, code)
  WHERE deleted_at IS NULL;

-- phone_number_1 は先頭一致以外にも「末尾4桁検索」したい場合がある
-- ため、btree だけだと ILIKE '%xxx%' は効かない。とはいえ前方一致
-- ILIKE 'xxx%' なら効くのでインデックス自体は置いておく。
CREATE INDEX IF NOT EXISTS idx_customers_shop_phone
  ON customers (shop_id, phone_number_1)
  WHERE deleted_at IS NULL;

-- 名前検索: 前方一致 (例: 「安田」と打ったら「安田大樹」がヒット) は
-- btree でも効く。部分一致 (ILIKE '%xxx%') を本気でやるなら pg_trgm
-- 拡張を入れて GIN トライグラム インデックスを貼る必要があるが、今回は
-- 必要最低限の改善にとどめ前方一致だけ効かせる。
CREATE INDEX IF NOT EXISTS idx_customers_shop_last_name
  ON customers (shop_id, last_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_shop_last_name_kana
  ON customers (shop_id, last_name_kana)
  WHERE deleted_at IS NULL;
