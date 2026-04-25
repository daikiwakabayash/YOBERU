-- 00037_payroll_email_settings.sql
--
-- 給与計算の請求書メール送信に必要な設定 2 つを追加する。
--
-- 1. staffs.payroll_email
--    請求書メールの送信先。スタッフのログインメール (users.email) を
--    既定で使うが、業務委託の場合「ログインアカウントに使うメールと
--    請求書を受け取るメールを分けたい」ケースがあるので、payroll_email
--    が入っていればそちらを優先する。
--
-- 2. brands.payroll_email_subject_template / payroll_email_body_template
--    ブランド単位で編集する請求書メールの件名 / 本文テンプレート。
--    プレースホルダ:
--      {{staff_name}}    宛先スタッフ名
--      {{year_month}}    対象月 (YYYY-MM)
--      {{shop_name}}     発行元店舗名
--      {{total}}         請求金額 (¥123,456 表示)
--      {{issue_date}}    発行日 (YYYY-MM-DD)
--    null のままなら従来のデフォルト本文 (sendPayrollInvoiceEmail 内
--    のフォールバック) を使う。

ALTER TABLE staffs
  ADD COLUMN IF NOT EXISTS payroll_email VARCHAR(255);

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS payroll_email_subject_template TEXT,
  ADD COLUMN IF NOT EXISTS payroll_email_body_template TEXT;
