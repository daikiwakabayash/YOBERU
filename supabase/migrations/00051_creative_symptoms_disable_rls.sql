-- ============================================================
-- YOBERU - Migration 051: creative_symptoms の RLS を無効化
-- ============================================================
--
-- creative_symptoms は他のマスタテーブル (visit_sources, agreement_templates
-- 等) と同様に「ログイン済みダッシュボード経由でのみアクセス」を前提と
-- しているので、Supabase Auth レベルで保護されていれば十分。テーブル個別の
-- RLS は不要。
--
-- 既存環境で 「new row violates row-level security policy for table
-- 'creative_symptoms'」エラーが出るのは、Supabase ダッシュボードで RLS が
-- デフォルト有効になっているため。このマイグレーションで明示的に解除する。

ALTER TABLE creative_symptoms DISABLE ROW LEVEL SECURITY;
