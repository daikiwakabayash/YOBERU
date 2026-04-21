-- 00025_booking_link_public_notice.sql
--
-- 強制リンク (/book/<slug>) の Step 1 (店舗と日時を選ぶ) に任意の
-- 案内文を表示できるようにする。LINE ボタンは不要という運用から、
-- 「初回特別価格」「キャンペーン情報」「店舗独自のご案内」など、
-- 自由記述のテキストをこの枠に出すための入れ物を用意する。
--
-- 改行はそのまま描画する (whitespace-pre-line)。

ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS public_notice TEXT;

COMMENT ON COLUMN booking_links.public_notice IS
  '公開予約画面 Step 1 の店舗カード下に表示する自由記述テキスト。改行を保持する。';
