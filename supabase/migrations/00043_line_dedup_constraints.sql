-- 00043_line_dedup_constraints.sql
--
-- LINE 連携の重複送信・整合性問題を構造的に防ぐ DB 制約とロックフィールド。
-- 各バグ ID はコミットメッセージ・コードコメントと対応する。
--
-- R1: appointments.line_notice_sent_at
--   sendBookingLineNotice (予約完了 LINE 即時通知) の二重起動を防ぐ。
--   null → non-null への UPDATE が成功した呼び出しだけが「送信権」を握る
--   (claim-based lock)。送信失敗時は呼び出し側が NULL に戻す = 再送可能。
--
-- R2: line_messages.line_message_id partial UNIQUE
--   LINE webhook の event 再送 (LINE 側のリトライ機構) で同じ顧客
--   メッセージが 2 行以上保存されるのを防ぐ。LINE は遅延 / 200 でも再送
--   することがある。welcome や outbound など line_message_id を持たない
--   行は対象外 (partial)。
--
-- R4: reengagement_logs に sent_date 派生カラム + partial UNIQUE
--   手動配信 + 自動 cron の race で同顧客に 2 通飛ぶのを防ぐ。
--   (customer_id, segment, sent_date) が日次ユニーク (status='sent' のみ)。
--   失敗 / cooldown skip は対象外なので、再送・冪等な記録は維持される。
--
-- R5: customers.line_user_id を partial UNIQUE に格上げ
--   既存は partial INDEX のみ (UNIQUE ではない)。アプリ層 (linkCustomer
--   Actions) で剥がし→貼りの順序保証はしているが、race で 2 顧客に同一
--   lineUserId が貼られる可能性が残っていた。DB 側で禁止する。
--
-- 注意:
--   既存データに重複がある場合、UNIQUE 化が失敗する。先に重複行を整理
--   してから index を作る。

-- ---------------------------------------------------------------------------
-- R1: appointments.line_notice_sent_at
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS line_notice_sent_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- R2: line_messages.line_message_id partial UNIQUE
-- ---------------------------------------------------------------------------
-- 既存の重複行を整理 (id が大きい = 後から保存された行を残す)
DELETE FROM line_messages
 WHERE id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY line_message_id
              ORDER BY id DESC
            ) AS rn
       FROM line_messages
      WHERE line_message_id IS NOT NULL
   ) t
   WHERE t.rn > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_line_messages_message_id
  ON line_messages (line_message_id)
  WHERE line_message_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- R4: reengagement_logs sent_date + partial UNIQUE
-- ---------------------------------------------------------------------------
-- sent_at を JST に変換した DATE を派生カラムとして持つ。timezone 関数は
-- IMMUTABLE ではないが、AT TIME ZONE は IMMUTABLE 扱いなので GENERATED
-- column に使える。
ALTER TABLE reengagement_logs
  ADD COLUMN IF NOT EXISTS sent_date DATE
  GENERATED ALWAYS AS ((sent_at AT TIME ZONE 'Asia/Tokyo')::date) STORED;

-- 既存の重複 ('sent' 状態の同日重複) を整理してから UNIQUE 化
DELETE FROM reengagement_logs
 WHERE id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY customer_id, segment, sent_date
              ORDER BY id DESC
            ) AS rn
       FROM reengagement_logs
      WHERE status = 'sent'
   ) t
   WHERE t.rn > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reengagement_logs_send_per_day
  ON reengagement_logs (customer_id, segment, sent_date)
  WHERE status = 'sent';

-- ---------------------------------------------------------------------------
-- R5: customers.line_user_id を partial UNIQUE INDEX に
-- ---------------------------------------------------------------------------
-- 既存の partial INDEX (UNIQUE でない) を drop してから UNIQUE 版を作る。
-- 00042 で全 line_user_id を NULL にしているため重複は無いが、念のため
-- 実行前に再整理する (id 大の方を残す)。
UPDATE customers
   SET line_user_id = NULL
 WHERE id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY line_user_id
              ORDER BY id DESC
            ) AS rn
       FROM customers
      WHERE line_user_id IS NOT NULL
        AND deleted_at IS NULL
   ) t
   WHERE t.rn > 1
 );

DROP INDEX IF EXISTS idx_customers_line_user_id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_customers_line_user_id
  ON customers (line_user_id)
  WHERE line_user_id IS NOT NULL AND deleted_at IS NULL;
