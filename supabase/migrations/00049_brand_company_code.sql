-- 00049_brand_company_code.sql
--
-- ブランド (= 企業) を企業コード (短い英数字 slug) で識別できるようにする。
-- 将来的に「企業コード + ID + パスワード」でログイン分岐するための布石。
-- 現状はラベル + 識別子としてのみ機能する。
--
-- 企業コード規則:
--   - 半角英数字 + ハイフン / アンダースコア (regex: ^[a-zA-Z0-9_-]{3,64}$)
--   - 一意 (deleted_at IS NULL の範囲で)

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS code VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS brands_code_unique
  ON brands (code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- 既存ブランド (YURUMU) の code を埋めるのは運用側の判断。マイグレーションは
-- カラム追加のみで何も埋めない (NULL のままにしておく)。
