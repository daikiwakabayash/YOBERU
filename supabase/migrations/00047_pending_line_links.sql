-- 00047_pending_line_links.sql
--
-- LINE 公式アカウントの「友だち追加」を、顧客カルテへ**自動**で紐付け
-- してしまうと、近い時間に複数の顧客が予約 → 友だち追加した際に
-- 別人のカルテに line_user_id が混入し、それ以降のリマインドが
-- 全く別の顧客に飛ぶ事故 (誤送信) が発生する。
--
-- それを防ぐため、friend follow イベントは一旦この pending_line_links
-- テーブルに保留する。スタッフは管理画面 (/line-link-queue) で
-- 「friend 追加してきた LINE プロフィール」と「該当の顧客カルテ」を
-- 目視で確認しながらマッチさせる。
--
-- 正式な紐付けは
--   ① LIFF + line_link_token (顧客が踏む)
--   ② このキューからスタッフが手動でマッチ
-- の 2 ルートに集約する。

CREATE TABLE IF NOT EXISTS pending_line_links (
  id BIGSERIAL PRIMARY KEY,

  -- どの店舗 (= どの公式アカウント) に follow されたか
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- friend 追加してきた LINE userId (U + 32hex)
  line_user_id VARCHAR(64) NOT NULL,

  -- LINE プロフィール (GET /v2/bot/profile/{userId} で取得)
  display_name VARCHAR(128),
  picture_url TEXT,
  status_message TEXT,

  followed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- スタッフがマッチ完了させた顧客 (= customers.line_user_id に書込済)
  matched_customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ,
  matched_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- スタッフが「該当顧客なし」として破棄したケース
  dismissed_at TIMESTAMPTZ,
  dismissed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  dismissed_reason VARCHAR(255),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- 同じ shop x 同じ LINE userId は 1 行に集約 (再 follow されても UPSERT)
  UNIQUE (shop_id, line_user_id)
);

-- 未対応 (= matched でも dismissed でもない) を高速に絞るための部分 index。
CREATE INDEX IF NOT EXISTS idx_pending_line_links_unmatched
  ON pending_line_links(shop_id, followed_at DESC)
  WHERE matched_customer_id IS NULL
    AND dismissed_at IS NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_line_links_line_user_id
  ON pending_line_links(line_user_id);

COMMENT ON TABLE pending_line_links IS
  'LINE 友だち追加の保留キュー。誤送信防止のため自動紐付けは行わず、スタッフが目視マッチさせる。';
