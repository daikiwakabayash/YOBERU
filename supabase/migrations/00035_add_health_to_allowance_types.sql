-- 00035_add_health_to_allowance_types.sql
--
-- 健康手当 (health) を claim 型として allowance_usage に受け入れる。
--
-- Phase 2 では「税込売上 ≥ 100 万 → 自動 10,000」として auto-grant に
-- していたが、運用ヒアリングで「ジム代など毎月の使用額をスタッフが
-- 入力するもの」(= claim 型) であることが判明したため再分類する。
--
-- 美容 (beauty) は逆に auto-grant 扱いに戻る (DB 行は起こさない) が、
-- CHECK 制約に残しておいても害はない (将来再び claim に戻したい場合に
-- 備える)。

ALTER TABLE allowance_usage
  DROP CONSTRAINT IF EXISTS allowance_usage_type_check;

ALTER TABLE allowance_usage
  ADD CONSTRAINT allowance_usage_type_check
  CHECK (allowance_type IN (
    'study','event_access',
    'health',
    'beauty','family','commute','accommodation',
    'referral','recruit','health_check','relocation','dental'
  ));
