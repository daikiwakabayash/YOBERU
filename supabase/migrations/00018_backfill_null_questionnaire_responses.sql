-- 00018_backfill_null_questionnaire_responses.sql
--
-- 00017 では customer_id が NOT NULL のケースしか処理しなかった。
-- 実際には顧客コード UNIQUE 衝突で INSERT が失敗し、
-- customer_id = NULL のまま保存された回答がある。
--
-- 本マイグレーションは:
--   1. customer_id IS NULL の回答を走査
--   2. 問診票の questions JSONB から phone_number_1 フィールドの
--      質問 ID を特定し、answers から電話番号を取得
--   3. その電話番号で既存顧客を検索
--   4. マッチしたら:
--      a) 全回答の Q&A サマリを description に追記
--      b) field マッピングされた値 (birth_date, address 等) を直接更新
--      c) response の customer_id を re-link
--
-- 冪等: 2回目以降は customer_id IS NULL の回答が無くなるため何もしない。

DO $$
DECLARE
  resp      RECORD;
  quest     RECORD;
  question  JSONB;
  qid       TEXT;
  qfield    TEXT;
  qlabel    TEXT;
  ans       TEXT;
  phone_val TEXT;
  real_cust RECORD;
  summary   TEXT;
BEGIN
  FOR resp IN
    SELECT qr.id AS resp_id,
           qr.questionnaire_id,
           qr.answers,
           qr.created_at
    FROM questionnaire_responses qr
    WHERE qr.customer_id IS NULL
  LOOP
    -- 問診票マスター取得
    SELECT id, title, questions
    INTO quest
    FROM questionnaires
    WHERE id = resp.questionnaire_id
      AND deleted_at IS NULL;

    IF quest IS NULL THEN CONTINUE; END IF;

    -- answers から電話番号を抽出 (field = 'phone_number_1' の質問を探す)
    phone_val := NULL;
    FOR question IN SELECT * FROM jsonb_array_elements(quest.questions)
    LOOP
      IF question->>'field' = 'phone_number_1' THEN
        phone_val := resp.answers->>(question->>'id');
        EXIT;
      END IF;
    END LOOP;

    IF phone_val IS NULL OR phone_val = '' THEN CONTINUE; END IF;

    -- 電話番号で既存顧客を検索 (全店舗対象)
    SELECT id, description
    INTO real_cust
    FROM customers
    WHERE phone_number_1 = phone_val
      AND deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 1;

    IF real_cust IS NULL THEN CONTINUE; END IF;

    -- ---- Q&A サマリを description に追記 ----
    summary := '[' || to_char(resp.created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
               || ' 問診票: ' || COALESCE(quest.title, '') || ']';

    FOR question IN SELECT * FROM jsonb_array_elements(quest.questions)
    LOOP
      qid    := question->>'id';
      qlabel := question->>'label';
      ans    := resp.answers->>qid;
      IF ans IS NOT NULL AND ans != '' THEN
        summary := summary || E'\n- ' || qlabel || ': ' || ans;
      END IF;
    END LOOP;

    UPDATE customers
    SET description = CASE
          WHEN description IS NULL OR description = ''
          THEN summary
          ELSE description || E'\n\n' || summary
        END,
        updated_at = NOW()
    WHERE id = real_cust.id;

    -- ---- field マッピング値を直接更新 ----
    FOR question IN SELECT * FROM jsonb_array_elements(quest.questions)
    LOOP
      qid    := question->>'id';
      qfield := question->>'field';
      ans    := resp.answers->>qid;

      IF qfield IS NULL OR qfield = '' OR ans IS NULL OR ans = '' THEN
        CONTINUE;
      END IF;

      CASE qfield
        WHEN 'full_name' THEN
          UPDATE customers SET
            last_name  = split_part(trim(ans), ' ', 1),
            first_name = NULLIF(
              trim(substring(trim(ans) from position(' ' in trim(ans)) + 1)),
              ''
            )
          WHERE id = real_cust.id;

        WHEN 'full_name_kana' THEN
          UPDATE customers SET
            last_name_kana  = split_part(trim(ans), ' ', 1),
            first_name_kana = NULLIF(
              trim(substring(trim(ans) from position(' ' in trim(ans)) + 1)),
              ''
            )
          WHERE id = real_cust.id;

        WHEN 'gender' THEN
          UPDATE customers SET
            gender = CASE
              WHEN ans LIKE '%男%' THEN 1
              WHEN ans LIKE '%女%' THEN 2
              ELSE 0
            END
          WHERE id = real_cust.id;

        WHEN 'phone_number_1' THEN
          NULL; -- 既にマッチ済みなのでスキップ

        WHEN 'birth_date' THEN
          BEGIN
            UPDATE customers SET birth_date = ans::date WHERE id = real_cust.id;
          EXCEPTION WHEN OTHERS THEN
            NULL; -- 日付パース失敗は無視
          END;

        WHEN 'zip_code' THEN
          UPDATE customers SET zip_code = ans WHERE id = real_cust.id;

        WHEN 'address' THEN
          UPDATE customers SET address = ans WHERE id = real_cust.id;

        WHEN 'email' THEN
          UPDATE customers SET email = ans WHERE id = real_cust.id;

        WHEN 'occupation' THEN
          UPDATE customers SET occupation = ans WHERE id = real_cust.id;

        WHEN 'phone_number_2' THEN
          UPDATE customers SET phone_number_2 = ans WHERE id = real_cust.id;

        WHEN 'line_id' THEN
          UPDATE customers SET line_id = ans WHERE id = real_cust.id;

        ELSE
          NULL; -- 未知のフィールドは無視
      END CASE;
    END LOOP;

    -- response を正しい顧客に re-link
    UPDATE questionnaire_responses
    SET customer_id = real_cust.id
    WHERE id = resp.resp_id;

    RAISE NOTICE 'Linked orphaned response % to customer % (phone: %)',
                 resp.resp_id, real_cust.id, phone_val;
  END LOOP;
END $$;
