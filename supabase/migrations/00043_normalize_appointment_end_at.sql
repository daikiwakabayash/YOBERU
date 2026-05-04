-- 00043_normalize_appointment_end_at.sql
--
-- 既存予約の end_at が HH:59 / HH:14 / HH:29 のような中途半端な分で
-- 保存されているデータを 5 分丸め UP で正規化する。
--
-- 背景:
--   メニューマスタの duration を 60 ではなく 59 と入力したケース、
--   あるいは旧バージョンで「end - 1 分」していた経路があったケースで、
--   予約 end_at が 18:59 のような端数で保存されている。
--   稼働率の見た目 % が 10 分単位で揃わない原因になるため、ここで
--   一括正規化する。
--
--   書込側 (createAppointment / updateAppointment / submitPublicBooking)
--   には helper/utils/time.ts::roundIsoMinuteUp を適用済みなので、
--   今後新規に :59 が発生することはない。これは過去データの修正のみ。
--
-- 安全性:
--   end_at だけ動かす。start_at と他の列は触らない。
--   重複検証を経て成立した既存予約に対して数分の延長を加えるだけなので、
--   サービス時間が想定外に短縮されることはない。

UPDATE appointments
SET end_at = end_at
           + ((5 - (EXTRACT(MINUTE FROM end_at)::int % 5)) % 5
              || ' minutes')::interval
           - (EXTRACT(SECOND FROM end_at)::int || ' seconds')::interval
WHERE deleted_at IS NULL
  AND EXTRACT(MINUTE FROM end_at)::int % 5 <> 0;
