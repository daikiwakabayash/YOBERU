-- ============================================================
-- YOBERU - Migration 055: AIアクションの成果測定リンク
-- ============================================================
--
-- AIマーケティング分析 (ai_analysis_runs / ai_analysis_actions) の
-- 「提案アクション → 実行 → 成果」フィードバックループを データ駆動 に
-- するための拡張 (Phase 1)。
--
-- これまで ai_analysis_actions には what_done / outcome (自由記述) と
-- rating しか無く、成果の検証が "自己申告" に依存していた。
-- 本マイグレーションで「そのアクションがどの強制リンク (= クリエイティブ)
-- に対応するか」を紐付けられるようにし、観測期間の CPA / 入会率 /
-- キャンセル率 / ROAS を クリエイティブ分析 (getCreativeAnalysis) から
-- 自動でスナップショットできるようにする。
--
--   - booking_link_id       : 成果を測定する対象の強制リンク (NULL = 紐付けなし)
--   - observed_start_month  : 成果観測期間の開始月 (YYYY-MM)
--   - observed_end_month    : 成果観測期間の終了月 (YYYY-MM)
--   - outcome_metrics       : 観測時点の KPI スナップショット (JSONB)
--       { reservationCount, visitCount, cancelCount, joinCount,
--         joinRate, cancelRate, adSpend, cpa, sales, roas,
--         observedStartMonth, observedEndMonth, bookingLinkId }
--   - outcome_evaluated_at  : スナップショットを取得した日時
--
-- 自由記述 (outcome / rating) は定性的な補足として残す。
--
-- すべて IF NOT EXISTS で冪等。

ALTER TABLE ai_analysis_actions
  ADD COLUMN IF NOT EXISTS booking_link_id INT REFERENCES booking_links(id),
  ADD COLUMN IF NOT EXISTS observed_start_month CHAR(7),
  ADD COLUMN IF NOT EXISTS observed_end_month CHAR(7),
  ADD COLUMN IF NOT EXISTS outcome_metrics JSONB,
  ADD COLUMN IF NOT EXISTS outcome_evaluated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_actions_booking_link
  ON ai_analysis_actions(booking_link_id)
  WHERE booking_link_id IS NOT NULL;
