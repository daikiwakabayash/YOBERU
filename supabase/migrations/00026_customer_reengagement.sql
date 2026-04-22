-- 00026_customer_reengagement.sql
--
-- 休眠顧客の自動検知と再来店促進メッセージ (リエンゲージ配信) の仕組み。
--
-- 3 つのセグメントを想定:
--   first_visit_30d : 初回来店から 30 日以内で 2 回目予約なし (最大リスク)
--   dormant_60d     : 最終来院から 60 日以上経過
--   plan_expired    : 会員プラン (チケット/サブスク) が直近に満了・解約
--
-- 運用フロー:
--   1. 管理者が /reengagement 画面を開く
--   2. セグメント毎に対象顧客数を確認
--   3. テンプレート (メッセージ + 付与クーポン) を編集して保存
--   4. 「配信」ボタンで対象顧客に LINE / メールで一斉送信
--   5. 既に同セグメントで最近送信済の顧客は cooldown_days 以内なら自動スキップ
--
-- 配信結果は reengagement_logs に残す。クーポン発行した場合は
-- customer_plans を INSERT し、coupon_plan_id で log に紐付ける。

-- ---------------------------------------------------------------------------
-- 1. reengagement_templates: セグメント別のメッセージテンプレート
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reengagement_templates (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  -- shop_id = NULL でブランド共通、非 NULL で特定店舗のみ
  shop_id INT,
  segment VARCHAR(32) NOT NULL,
  -- 管理画面のタイトル (配信履歴の識別用)
  title VARCHAR(128) NOT NULL,
  -- 本文。{customer_name} / {shop_name} / {coupon_name} を置換する
  message TEXT NOT NULL,
  -- 配信時に自動で 1 回限定チケットを発行したい場合の menu_manage_id
  -- (menus.plan_type='ticket' のメニューを指定する前提)。NULL ならクーポン無し
  coupon_menu_manage_id VARCHAR(64),
  -- 同じセグメント × 同じ顧客に何日間再送しないか
  cooldown_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 同 (brand, shop, segment) の active テンプレは 1 つのみ。
CREATE UNIQUE INDEX IF NOT EXISTS uk_reengagement_templates_scope_segment
  ON reengagement_templates (brand_id, COALESCE(shop_id, 0), segment)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON reengagement_templates;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reengagement_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. reengagement_logs: 配信履歴 (重複送信防止 + 効果測定)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reengagement_logs (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id),
  segment VARCHAR(32) NOT NULL,
  -- 'line' / 'email' / 'skipped'
  channel VARCHAR(16) NOT NULL,
  -- 'sent' / 'failed' / 'skipped_cooldown' / 'skipped_no_contact'
  status VARCHAR(24) NOT NULL,
  -- 送信時点の本文 (テンプレートから置換済)
  message TEXT,
  -- 発行したチケットがあれば customer_plans.id
  coupon_plan_id BIGINT REFERENCES customer_plans(id),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 顧客ごとの重複送信防止 + 履歴参照用
CREATE INDEX IF NOT EXISTS idx_reengagement_logs_customer
  ON reengagement_logs (customer_id, segment, sent_at DESC);

-- 店舗ごとの配信実績集計用
CREATE INDEX IF NOT EXISTS idx_reengagement_logs_shop_segment
  ON reengagement_logs (shop_id, segment, sent_at DESC);
