-- 00042_agreements.sql
--
-- 電子契約 (会員申込書 / 領収書 / 同意書 等) の保存テーブル。
--
-- 法的効力に必要な要素:
--   1. 契約全文の表示 (body_snapshot に署名時点の本文を保存)
--   2. 明示的な同意 (agreed_checks に各チェック項目の真偽値を保存)
--   3. 電子署名 (signature_data_url に canvas で書いた手書き署名を base64
--      PNG として保存 + signed_name に氏名タイプ入力)
--   4. タイムスタンプ (signed_at)
--   5. 改ざん検知のヒント (signer_ip / signer_user_agent / created_at)
--
-- 顧客への控え送付:
--   - LINE / メールで /agree/<uuid> リンクを送る運用 (ID/PW 発行なし)
--   - 同 URL は閲覧のみ (status=signed のときは編集不可)

-- =====================================================
-- agreement_templates: ブランド単位の文面テンプレート
-- =====================================================
CREATE TABLE IF NOT EXISTS agreement_templates (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  -- 店舗単位でカスタムしたい場合のみ。NULL ならブランド共通。
  shop_id INT REFERENCES shops(id),
  -- 'membership' (会員申込) / 'receipt' (領収書) / 'consent' (同意書) など。
  -- 将来拡張で別タブにするときの判別キー。
  kind VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  -- 本文 (Markdown 風プレーンテキスト)。{{plan_amount}} 等のプレース
  -- ホルダーが使える。署名時点に値を埋めて body_snapshot に確定。
  body_text TEXT NOT NULL,
  -- 同意チェック必須項目: [{key: "consent", label: "上記すべてに同意します"}, ...]
  required_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 入力フィールドのカスタム定義 (将来拡張)。MVP では使わない。
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agreement_templates_brand_kind
  ON agreement_templates (brand_id, kind, is_active)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agreement_templates_kind_check'
  ) THEN
    ALTER TABLE agreement_templates
      ADD CONSTRAINT agreement_templates_kind_check
      CHECK (kind IN ('membership','receipt','consent','other'));
  END IF;
END $$;

-- =====================================================
-- agreements: 個別の同意/署名レコード
-- =====================================================
CREATE TABLE IF NOT EXISTS agreements (
  id BIGSERIAL PRIMARY KEY,
  -- 公開リンク用の slug。LINE / メールで /agree/<uuid> を送る。
  uuid VARCHAR(36) NOT NULL UNIQUE,
  brand_id INT NOT NULL REFERENCES brands(id),
  shop_id INT NOT NULL REFERENCES shops(id),
  customer_id INT NOT NULL REFERENCES customers(id),
  template_id INT NOT NULL REFERENCES agreement_templates(id),
  kind VARCHAR(32) NOT NULL,

  -- 生成時にスタッフが入力する変動項目 (月額 / 契約開始日 / プラン名 等)。
  -- body_text のプレースホルダー埋め込みに使う。
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 署名時に確定した本文 (= プレースホルダー埋込済み)。改ざん不能の証拠。
  body_snapshot TEXT,

  -- 'pending' = リンク作成済み、まだ署名されていない
  -- 'signed'  = 署名完了
  -- 'cancelled' = 本部側で取り消し
  status VARCHAR(16) NOT NULL DEFAULT 'pending',

  -- 署名情報 (status='signed' で全部入る)
  signed_name VARCHAR(255),
  signature_data_url TEXT,           -- base64 PNG (data:image/png;base64,...)
  agreed_checks JSONB,               -- {check_key: true}
  signer_ip VARCHAR(45),
  signer_user_agent TEXT,
  signed_at TIMESTAMPTZ,

  -- 控え送付ログ
  notified_at TIMESTAMPTZ,           -- LINE/メール送信した時刻
  notified_via VARCHAR(16),          -- 'line' | 'email' | 'both'

  -- 生成情報 (本部スタッフ)
  created_by_user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Supabase デフォルトで public スキーマの新規テーブルに RLS が有効になる
-- 環境向け対策: このシステムでは認証 / 権限はアプリケーション層で
-- 行うため、agreement_templates / agreements は RLS を明示的に OFF に
-- する。これを入れないと anon / authenticated の INSERT / UPDATE が
-- "new row violates row-level security policy" で全部弾かれる。
ALTER TABLE agreement_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE agreements DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agreements_customer
  ON agreements (customer_id, kind)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agreements_uuid
  ON agreements (uuid)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agreements_shop_status
  ON agreements (shop_id, status)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agreements_status_check'
  ) THEN
    ALTER TABLE agreements
      ADD CONSTRAINT agreements_status_check
      CHECK (status IN ('pending','signed','cancelled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agreements_kind_check'
  ) THEN
    ALTER TABLE agreements
      ADD CONSTRAINT agreements_kind_check
      CHECK (kind IN ('membership','receipt','consent','other'));
  END IF;
END $$;

-- =====================================================
-- NAORU 整体 大分あけのアクロス院 会員申込書 デフォルトテンプレート
-- =====================================================
INSERT INTO agreement_templates (brand_id, kind, title, body_text, required_checks, is_active)
SELECT
  1, -- ブランド ID = 1 を想定。複数ブランド運用時は brand 毎にコピー。
  'membership',
  'NAORU整体 大分あけのアクロス院 会員お申し込み書',
$$『NAORU整体 大分あけのアクロス院』会員お申し込み書

ご入会いただく皆様に下記の内容をご確認いただいております。
内容をよくお読みいただき、確認欄へチェック及び署名の記入をお願いします。

【会費・契約】
●当会員制度は月額 {{plan_amount_yen}} 円（税込）の会費をお支払いただく事により、当院で提供する「会員専用プログラム」が会員価格でご利用いただけるようになるサービスです。
●契約期間 {{contract_start_date}} 〜
●当制度はクレジット契約による引き落としとなります。尚、特段のお申し出がない限り、契約は更新されるものとします。
  自動的に利用継続となり月額 {{plan_amount_yen}} 円（税込）が引き落とされます。
●翌月以降、入会日が更新日となります。
※次回引き落とし日は {{next_billing_date}} です（契約日のちょうど 1 ヶ月後 / 月末は次月末にクランプ）。
※消費しきれなかった回数は次月まで繰り越し可能です。
※プラン変更や退会希望の場合、申請月の翌月に反映されます。
  例：1 月に退会希望の場合は 12 月末までに当院にて所定会員種別変更手続きをお願いいたします。
●当日キャンセルの場合は、1 回分消費となります。ご予約の変更、キャンセルについては前日までにお願いいたします。
●遅刻された場合は、施術時間が短縮されますので、ご予約時間の 5 分前など、スムーズにご案内させていただけるよう、お時間に余裕をもってお越しください。

【入会資格について】
・私は現在、妊娠していません（契約期間中に妊娠した場合は遅延なく申し出ます）
・私は他人に伝染する恐れのある疾病等にかかっていません（契約期間中に上記の疾病等にかかった場合は遅延なく申し出ます）
・私は現在の健康状態、会員資格及び入会申込書に記載した内容（住所・銀行口座・クレジットカード番号）に変更が生じた場合は遅延なく申し出ます

【店舗の利用について】
●下記の項目に該当すると判断された場合には店舗への入場をお断りすることを了承します。
・酒気を帯びている
・健康状態を害しており施術に不適切な状態のとき
・正当な理由なく当店のスタッフの指示に従わないとき

【退会の手続きについて】
・会員様の事情により退会される場合は、解約のお手続きが必要になります。解約のお手続きがお済でない場合は自動的に契約が更新されます。1 度も来院されなかった月に関しても、退会手続きがお済でない場合は返金致しかねますのであらかじめご了承ください。

※退会ご希望の際は、退会希望月の前月までにご本人様がご来院の上、退会手続きを行ってください。手続きがお済でない場合は会費支払いの義務が発生するものとします。

【お申込み者氏名】 {{customer_name}}
【お申込み日】 {{signed_at}}

院長 東川 幸平$$,
$$[
  {"key":"agree_fee","label":"月額会費・クレジット契約・自動更新の内容を理解し同意します"},
  {"key":"agree_eligibility","label":"入会資格 (妊娠・伝染病・変更申告) の各項目に該当・同意します"},
  {"key":"agree_facility","label":"店舗利用ルール (酒気帯び・健康状態・スタッフ指示遵守) に同意します"},
  {"key":"agree_withdrawal","label":"退会手続きの内容 (自動更新・前月までの申請) を理解しました"},
  {"key":"agree_all","label":"上記すべてを確認のうえ、NAORU 整体 大分あけのアクロス院会員入会に同意します"}
]$$::jsonb,
TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM agreement_templates
  WHERE brand_id = 1 AND kind = 'membership' AND deleted_at IS NULL
);
