-- 00047_ai_analysis_history.sql
--
-- AI マーケティング分析の結果と、提案アクションの実行追跡を保存するための
-- テーブル群。
--
-- データモデル:
--   - ai_analysis_runs:    AI 分析を「実行した」イベントの 1 行
--                          サマリー / セクション全体 / 入力コンテキストを保存
--   - ai_analysis_actions: 分析結果に含まれる個別アクションの追跡
--                          「実行済み」「何をしたか」「結果」「評価」を蓄積
--
-- 運用フロー:
--   1. AI 分析タブで「分析を実行」を押すと Claude を呼び、結果を画面に表示
--   2. 「この分析結果を保存して追跡を開始」ボタン (or 自動) で
--      ai_analysis_runs + ai_analysis_actions を INSERT
--   3. 各アクションに対して「実行済み」「実行内容メモ」「結果メモ」を入力
--   4. 履歴ビューでアクション別の効果を可視化

CREATE TABLE IF NOT EXISTS ai_analysis_runs (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  shop_id INT NOT NULL REFERENCES shops(id),
  -- 分析対象期間 (UI フィルタの startMonth / endMonth)
  start_month CHAR(7) NOT NULL,
  end_month CHAR(7) NOT NULL,
  -- AI 出力 (Claude のレスポンスをそのまま保存)
  summary TEXT,
  meta_ads JSONB,        -- { verdict, recommendedRadiusKm, recommendedAgeGroups, rationale, actionItems }
  flyer JSONB,           -- 同上
  creative_hypotheses JSONB, -- ["仮説1", "仮説2", ...]
  warnings JSONB,        -- ["注意1", ...]
  -- Claude に渡した入力データ (再現性 / 検証用)
  context_snapshot JSONB,
  -- 実行者
  created_by_user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_shop_created
  ON ai_analysis_runs(shop_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ai_analysis_actions (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES ai_analysis_runs(id) ON DELETE CASCADE,
  -- どのセクションのアクションか
  -- 'meta_ads' | 'flyer' | 'creative_hypothesis' | 'other'
  section VARCHAR(32) NOT NULL,
  -- 同じセクション内の表示順 (0-index)
  position INT NOT NULL,
  -- AI が出力したアクション原文
  action_text TEXT NOT NULL,
  -- 実行ステータス
  -- 'pending' (未着手) / 'in_progress' (実行中) / 'done' (完了) / 'skipped' (見送り)
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  -- 実行記録
  executed_at TIMESTAMPTZ,
  executed_by_user_id INT REFERENCES users(id),
  what_done TEXT,             -- 「実際に何をしたか」自由記述
  -- 結果記録
  outcome TEXT,               -- 「やってみてどうだったか」自由記述
  outcome_recorded_at TIMESTAMPTZ,
  -- 評価 (1-5、任意)
  rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_actions_run
  ON ai_analysis_actions(run_id, section, position);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_actions_status
  ON ai_analysis_actions(status);
