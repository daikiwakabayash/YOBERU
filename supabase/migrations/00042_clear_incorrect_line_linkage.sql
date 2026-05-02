-- 00042_clear_incorrect_line_linkage.sql
--
-- 背景:
--   migration 00013 以降の LINE Messaging API 連携で、
--   app/api/line/webhook/route.ts の `follow` イベント処理が
--   「直近 10 件の予約客のうち line_user_id が NULL の最初の 1 人に
--    無条件で line_user_id を貼り付ける」という危険な推測ロジックに
--   なっていた。結果として、友だち追加した本人とは別の顧客に LINE
--   userId が紐付き、その顧客への予約リマインドが赤の他人に届く事故が
--   発生していた。
--
-- 本マイグレーション:
--   1. customers.line_user_id を全 NULL に戻す (誤紐付けの完全リセット)
--   2. line_messages.customer_id も全 NULL に戻す (上記と整合させる)
--
-- 復旧手順:
--   - Webhook の自動推測ロジックは廃止 (commit 同梱)。
--   - 以後の紐付けは LIFF 経由 (予約完了画面の「LINE 連携」ボタン →
--     LIFF で liff.getProfile() → 署名済 token で customer 特定) で行う。
--   - 既存顧客の救済は /line-chat の手動紐付け UI から行う。
--
-- 注意:
--   不可逆な操作。本番投入前に DB バックアップを取得しておくこと。

UPDATE customers
   SET line_user_id = NULL,
       updated_at = NOW()
 WHERE line_user_id IS NOT NULL;

UPDATE line_messages
   SET customer_id = NULL
 WHERE customer_id IS NOT NULL;
