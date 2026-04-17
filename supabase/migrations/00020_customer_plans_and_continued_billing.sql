-- 00020_customer_plans_and_continued_billing.sql
--
-- 会員プラン (チケット / サブスクリプション) の購入と消化を追跡する
-- ための customer_plans テーブルと関連カラムを追加する。
-- 同時に「継続決済」(サブスクの月次課金だけ計上し来院扱いにはしない)
-- を appointments に表現するためのフラグを追加する。
--
-- 要件サマリー:
--   1. menus をチケット / サブスク / 通常の 3 種に区別する
--      (既存の BRD-PLAN-* メニューも plan_type でラベリングし直せる)
--   2. 顧客がプランを購入したら customer_plans に 1 行作る。
--      チケットなら total_count に回数、used_count に消化済みを記録。
--   3. 予約 (appointments) がチケットを 1 回消化した場合は
--      consumed_plan_id で customer_plans を指す (後段実装で使用)。
--   4. サブスクの継続決済だけ記録したいときは
--      appointments.is_continued_billing = TRUE として、
--      売上集計には入るが来院カウント / チケット消化には入らない。

-- ---------------------------------------------------------------------------
-- 1. menus テーブルを拡張
--    plan_type: NULL (通常メニュー) / 'ticket' (回数券) / 'subscription' (月額)
--    ticket_count: plan_type='ticket' のときの回数 (4 回券なら 4)
-- ---------------------------------------------------------------------------
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS plan_type VARCHAR(16),
  ADD COLUMN IF NOT EXISTS ticket_count INT;

-- plan_type を制約 (CHECK)。NULL は通常メニュー。
ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_plan_type_check;
ALTER TABLE menus
  ADD CONSTRAINT menus_plan_type_check
  CHECK (plan_type IS NULL OR plan_type IN ('ticket', 'subscription'));

-- plan_type='ticket' のときだけ ticket_count を必須にする部分制約。
-- (CHECK で素朴に IF-ELSE)
ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_ticket_count_check;
ALTER TABLE menus
  ADD CONSTRAINT menus_ticket_count_check
  CHECK (
    (plan_type = 'ticket' AND ticket_count IS NOT NULL AND ticket_count > 0)
    OR plan_type IS DISTINCT FROM 'ticket'
  );

-- ---------------------------------------------------------------------------
-- 2. customer_plans: 顧客が購入した個別のプランインスタンス
--    - ticket 型: total_count / used_count で残数を管理
--    - subscription 型: total_count = NULL, used_count = NULL (通い放題)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_plans (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  shop_id INT NOT NULL REFERENCES shops(id),
  customer_id INT NOT NULL REFERENCES customers(id),
  menu_manage_id VARCHAR(64) NOT NULL,        -- どのプランを買ったか (menus.menu_manage_id)
  menu_name_snapshot VARCHAR(255) NOT NULL,   -- 購入時点のメニュー名を保存 (後で menus 側が消えても履歴が残る)
  price_snapshot INT NOT NULL,                -- 購入時点の金額 (単位 円)
  plan_type VARCHAR(16) NOT NULL CHECK (plan_type IN ('ticket', 'subscription')),
  total_count INT,                            -- ticket のみ: 購入時の合計回数
  used_count INT NOT NULL DEFAULT 0,          -- ticket のみ: 消化済み回数
  purchased_appointment_id INT REFERENCES appointments(id),  -- 購入のトリガーとなった予約
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- サブスクは「次回課金日」を持たせて予約表上の継続決済枠に紐付けやすくする
  next_billing_date DATE,
  status SMALLINT NOT NULL DEFAULT 0,         -- 0=active, 1=exhausted/closed, 2=cancelled
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_plans_customer
  ON customer_plans (customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_plans_shop_status
  ON customer_plans (shop_id, status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. appointments にプラン関連のカラムを追加
--    - consumed_plan_id: この予約でチケットを 1 回消化した先の customer_plans
--    - is_continued_billing: サブスクの月次継続決済だけ計上するときの目印。
--      このフラグが TRUE の appointments は:
--        * 売上集計には含む (status=2 のとき)
--        * 来院回数にはカウントしない
--        * チケット消化にもカウントしない
--        * 予約表上では「継続決済枠」として表示 (営業時間外 or 末端枠)
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS consumed_plan_id BIGINT REFERENCES customer_plans(id),
  ADD COLUMN IF NOT EXISTS is_continued_billing BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_appointments_consumed_plan
  ON appointments (consumed_plan_id)
  WHERE consumed_plan_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. 既存の BRD-PLAN-* メニューを plan_type でタグ付け
--    NAORUプラン / 通い放題系 → subscription
--    ボディケア 30/60/90 分 → ticket (1 回券扱い)
--    yurumu n 回 m 分 → ticket (n 回券)
-- ---------------------------------------------------------------------------
-- サブスク系 (NAORU プランは「月額通い放題」)
UPDATE menus
   SET plan_type = 'subscription'
 WHERE menu_manage_id = 'BRD-PLAN-NAORU';

-- ボディケア各時間帯は単発チケット扱い (1 回券)
UPDATE menus
   SET plan_type = 'ticket', ticket_count = 1
 WHERE menu_manage_id IN (
   'BRD-PLAN-BODY-30',
   'BRD-PLAN-BODY-60',
   'BRD-PLAN-BODY-90'
 );

-- yurumu 系は menu_manage_id の "2x30" "3x60" などから回数を推定して設定
UPDATE menus SET plan_type='ticket', ticket_count=2 WHERE menu_manage_id='BRD-PLAN-YURUMU-2x30';
UPDATE menus SET plan_type='ticket', ticket_count=2 WHERE menu_manage_id='BRD-PLAN-YURUMU-2x60';
UPDATE menus SET plan_type='ticket', ticket_count=3 WHERE menu_manage_id='BRD-PLAN-YURUMU-3x30';
UPDATE menus SET plan_type='ticket', ticket_count=3 WHERE menu_manage_id='BRD-PLAN-YURUMU-3x60';
UPDATE menus SET plan_type='ticket', ticket_count=4 WHERE menu_manage_id='BRD-PLAN-YURUMU-4x30';
UPDATE menus SET plan_type='ticket', ticket_count=4 WHERE menu_manage_id='BRD-PLAN-YURUMU-4x60';
UPDATE menus SET plan_type='ticket', ticket_count=6 WHERE menu_manage_id='BRD-PLAN-YURUMU-6x30';
