-- one_off_rename_brand_to_yurumu_seitai.sql
--
-- 一回限りの手動修正用 SQL。
--
-- ブランド名 (brands.id = 1) を 'NAORU整骨院' から 'YURUMU整体' に改名する。
--
-- 背景:
--   Supabase SQL Editor で
--     UPDATE brands SET name = 'YURUMU整体'
--     WHERE name = 'YURUMU' AND deleted_at IS NULL;
--   を実行したが、現在のブランド名は 'NAORU整骨院' であり 'YURUMU' に
--   一致するレコードが無いため 0 件更新となっていた。
--   実在する name で WHERE 句を組み直して改名する。
--
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor で全部を 1 トランザクションで実行。
--
-- 復旧後の状態:
--   - brands.id = 1, name = 'YURUMU整体'

BEGIN;

UPDATE brands
SET name = 'YURUMU整体',
    updated_at = NOW()
WHERE id = 1
  AND name = 'NAORU整骨院'
  AND deleted_at IS NULL;

-- 確認用 (実行結果に 1 行返れば成功)
SELECT id, name, updated_at
FROM brands
WHERE id = 1;

COMMIT;
