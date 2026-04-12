-- 00015_shop_logo_storage_policies.sql
--
-- shop-logos バケットに対する Storage ポリシーを追加。
-- バケット自体は PUBLIC (読み取りは誰でも可) だが、
-- SDK 経由のアクセスには SELECT / INSERT / UPDATE ポリシーが必要。

-- 誰でも（公開予約フォーム等）ロゴを読み取れるようにする
CREATE POLICY "Public read access for shop logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shop-logos');

-- 認証済みユーザーがロゴをアップロードできるようにする
CREATE POLICY "Authenticated users can upload shop logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shop-logos');

-- 既存ロゴの上書き (upsert) を許可する
CREATE POLICY "Authenticated users can update shop logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'shop-logos')
WITH CHECK (bucket_id = 'shop-logos');

-- 認証済みユーザーがロゴを削除できるようにする
CREATE POLICY "Authenticated users can delete shop logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'shop-logos');
