-- 00039_time_records.sql
--
-- Web打刻 (出勤 / 退勤 / 休憩開始 / 休憩終了) を保存するテーブル。
--
-- - スタッフは個人スマホのブラウザから /punch ページにアクセスし、
--   ボタンタップで出退勤を記録する。
-- - サーバ側で「位置情報が店舗から半径 1 km 以内」を Haversine で
--   検証し、範囲外なら拒否する (クライアント送信値の改ざん耐性)。
--   shops.latitude / shops.longitude は migration 00022 で追加済。
-- - 残業代計算 (00041) はこのテーブルから日次・週次・月次の
--   実労働時間を集計する。

CREATE TABLE IF NOT EXISTS time_records (
  id BIGSERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id),
  -- 'clock_in' | 'clock_out' | 'break_start' | 'break_end'
  record_type VARCHAR(16) NOT NULL,
  -- 実打刻時刻 (TZ 込)
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- ローカル日付 (Asia/Tokyo) — 月またぎ夜勤も含めて「勤務日」を確定するために
  -- アプリ層で計算した値を保存する。集計の inex に使用。
  work_date DATE NOT NULL,
  -- 端末から取得した GPS 座標 (検証ログ目的で必ず保存)
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  -- accuracy: GPS 精度 (m)。Haversine 検証結果と合わせて記録。
  accuracy_m NUMERIC(8,2),
  -- 店舗との距離 (m)。1 km 以下のはずだが、運用調査用に保存。
  distance_m NUMERIC(10,2),
  -- 端末情報 (user-agent)。不正打刻調査用。
  user_agent TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_time_records_staff_date
  ON time_records (staff_id, work_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_records_shop_date
  ON time_records (shop_id, work_date)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'time_records_type_check'
  ) THEN
    ALTER TABLE time_records
      ADD CONSTRAINT time_records_type_check
      CHECK (record_type IN ('clock_in','clock_out','break_start','break_end'));
  END IF;
END $$;

-- 打刻許可半径 (m) を brand 単位で持てるようにする。デフォルト 1000 m。
-- サーバ側 Haversine 検証はこの値を上限とする。
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS punch_radius_m INT NOT NULL DEFAULT 1000;
