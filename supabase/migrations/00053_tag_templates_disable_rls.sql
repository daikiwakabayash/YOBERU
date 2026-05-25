-- ============================================================
-- YOBERU - Migration 053: tag_templates の RLS を無効化
-- ============================================================
--
-- tag_templates は他のマスタテーブル (visit_sources, creative_symptoms,
-- agreement_templates 等) と同様に「ログイン済みダッシュボード経由
-- でのみアクセス」を前提としているので、Supabase Auth レベルで保護
-- されていれば十分。テーブル個別の RLS は不要。
--
-- 既存環境で 「new row violates row-level security policy for table
-- 'tag_templates'」エラーが出るのは、Supabase ダッシュボードで RLS が
-- デフォルト有効になっているため。このマイグレーションで明示的に解除する。

ALTER TABLE tag_templates DISABLE ROW LEVEL SECURITY;
