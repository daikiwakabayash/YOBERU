-- 00034_extend_allowance_types.sql
--
-- Phase 2.5: 都度請求型 (claim) の手当を allowance_usage に追加で受け
-- 入れるための CHECK 制約拡張。
--
-- 追加する手当:
--   beauty        — 美容手当 (売上 100 万超で発生、繰越不可、請求書記載)
--   family        — 家族休暇 / 手当 (入籍者対象)
--   commute       — 通勤手当 (全員、上限 月 2 万円)
--   accommodation — 宿泊手当
--   referral      — 紹介手当 (NAORU 紹介で入社した先生)
--   recruit       — リクルート手当 (双方在籍)
--   health_check  — 健康診断 (実費、領収書必須)
--   relocation    — 引越し手当 (異動者)
--   dental        — 歯科手当 (年 2 回 FB で案内)
--
-- どれも「使用額をスタッフが記録 → 月の請求書に計上」フローで、自動付与
-- ではない (claim 型)。リゾート / オンラインサロン / 社内旅行は現金支給
-- ではないので追加しない (情報メモは payroll 詳細ページに記載予定)。

ALTER TABLE allowance_usage
  DROP CONSTRAINT IF EXISTS allowance_usage_type_check;

ALTER TABLE allowance_usage
  ADD CONSTRAINT allowance_usage_type_check
  CHECK (allowance_type IN (
    -- 既存 (Phase 2)
    'study', 'event_access',
    -- 追加 (Phase 2.5)
    'beauty', 'family', 'commute', 'accommodation',
    'referral', 'recruit', 'health_check', 'relocation', 'dental'
  ));
