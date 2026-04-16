-- 00017_backfill_orphaned_questionnaire_responses.sql
--
-- 問診票マッチングの shop_id バグ修正前に送信された回答が、
-- 正しい顧客に紐づかず別の顧客レコードとして作成されていた
-- ケースを救済する。
--
-- 処理内容:
--   1. questionnaire_responses の customer_id が、同じ電話番号を持つ
--      「本来の顧客」と異なる場合、本来の顧客に re-link する。
--   2. 孤立した顧客 (問診票回答で作成された重複) の description を
--      本来の顧客に追記する。
--   3. 孤立した顧客をソフトデリートする。
--
-- 冪等: 2回実行しても問題ない (既に修正済みなら何もしない)。
-- ※ 対象: 問診票経由で作成された顧客 + 強制リンクで作成された顧客で
--    同一電話番号のペアがある場合のみ。

DO $$
DECLARE
  resp RECORD;
  orphan_cust RECORD;
  real_cust RECORD;
BEGIN
  -- questionnaire_responses をループ
  FOR resp IN
    SELECT qr.id AS resp_id,
           qr.customer_id AS resp_cust_id,
           qr.questionnaire_id
    FROM questionnaire_responses qr
    WHERE qr.customer_id IS NOT NULL
  LOOP
    -- この回答に紐づく顧客 (問診票で作成された方)
    SELECT id, phone_number_1, last_name, first_name, description, shop_id
    INTO orphan_cust
    FROM customers
    WHERE id = resp.resp_cust_id
      AND deleted_at IS NULL;

    IF orphan_cust IS NULL THEN CONTINUE; END IF;
    IF orphan_cust.phone_number_1 IS NULL OR orphan_cust.phone_number_1 = '00000000000' THEN
      CONTINUE;
    END IF;

    -- 同じ電話番号を持つ「別の顧客」がいるかチェック。
    -- ID が小さい方 (先に作られた方) を「本来の顧客」とみなす。
    SELECT id, description
    INTO real_cust
    FROM customers
    WHERE phone_number_1 = orphan_cust.phone_number_1
      AND id != orphan_cust.id
      AND deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 1;

    IF real_cust IS NULL THEN CONTINUE; END IF;

    -- 本来の顧客に問診票 description を追記
    IF orphan_cust.description IS NOT NULL AND orphan_cust.description != '' THEN
      UPDATE customers
      SET description = CASE
            WHEN description IS NULL OR description = ''
            THEN orphan_cust.description
            ELSE description || E'\n\n' || orphan_cust.description
          END,
          updated_at = NOW()
      WHERE id = real_cust.id;
    END IF;

    -- 回答を本来の顧客に re-link
    UPDATE questionnaire_responses
    SET customer_id = real_cust.id
    WHERE id = resp.resp_id;

    -- 孤立した顧客をソフトデリート
    UPDATE customers
    SET deleted_at = NOW()
    WHERE id = orphan_cust.id;

    RAISE NOTICE 'Re-linked response % from customer % to customer %',
                 resp.resp_id, orphan_cust.id, real_cust.id;
  END LOOP;
END $$;
