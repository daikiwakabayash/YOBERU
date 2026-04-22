-- 00028_customer_attachments_storage_policies.sql
--
-- customer-attachments バケットに対する Storage ポリシー。
-- shop-logos と違い、このバケットは顧客のプライベート情報 (施術前後写真
-- 等) を含むため PUBLIC ではなく認証済みユーザーだけが読み書きできる
-- ようにする。
--
-- 事前に Supabase Studio で customer-attachments バケットを作成する:
--   - Name: customer-attachments
--   - Public bucket: OFF (非公開)
--
-- このマイグレーションではポリシーのみ設定する。バケット未作成なら
-- 別途 Storage UI か supabase CLI で作成が必要。

-- 認証済みユーザーがファイルを読み取れる
CREATE POLICY "Authenticated users can read customer attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'customer-attachments');

-- 認証済みユーザーがアップロードできる
CREATE POLICY "Authenticated users can upload customer attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'customer-attachments');

-- 認証済みユーザーが上書き (upsert) できる
CREATE POLICY "Authenticated users can update customer attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'customer-attachments')
WITH CHECK (bucket_id = 'customer-attachments');

-- 認証済みユーザーが削除できる
CREATE POLICY "Authenticated users can delete customer attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'customer-attachments');
