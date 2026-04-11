-- 00006_visit_count_and_slug_backfill.sql
-- Two unrelated one-shot fixes that can both be safely re-run.
--
-- 1) Backfill customers.visit_count / customers.last_visit_date /
--    appointments.visit_count from completed appointments. The columns
--    were added in 00002 but never written to from application code, so
--    every existing customer's "新規" badge was permanently true.
--
-- 2) Sanitize legacy questionnaire slugs that were created before the
--    automatic slug normalization landed. Rows like "test ebis" become
--    "test-ebis" so /q/<slug> resolves cleanly through the public route.
--
-- Both sections are idempotent: they always recompute from the underlying
-- truth, never increment.

-- ---------------------------------------------------------------------------
-- 1. visit_count / last_visit_date backfill
-- ---------------------------------------------------------------------------

-- (a) Each customer's cumulative completed visit count.
UPDATE customers c
SET visit_count = (
  SELECT COUNT(*)
  FROM appointments a
  WHERE a.customer_id = c.id
    AND a.status = 2                -- 完了
    AND a.cancelled_at IS NULL
    AND a.deleted_at IS NULL
);

-- (b) Each customer's most recent completed visit date (Asia/Tokyo).
UPDATE customers c
SET last_visit_date = sub.last_date
FROM (
  SELECT
    a.customer_id,
    MAX((a.start_at AT TIME ZONE 'Asia/Tokyo')::date) AS last_date
  FROM appointments a
  WHERE a.status = 2
    AND a.cancelled_at IS NULL
    AND a.deleted_at IS NULL
  GROUP BY a.customer_id
) sub
WHERE c.id = sub.customer_id;

-- (c) Per-appointment visit_count snapshot.
--     Defined so that visit_count = 1 means "this is the customer's first
--     actual completed visit" (matches the "1=初回" comment from 00002).
--     Implementation: 1 + (count of strictly-prior completed visits).
UPDATE appointments a
SET visit_count = 1 + (
  SELECT COUNT(*)
  FROM appointments a2
  WHERE a2.customer_id = a.customer_id
    AND a2.status = 2
    AND a2.cancelled_at IS NULL
    AND a2.deleted_at IS NULL
    AND a2.start_at < a.start_at
)
WHERE a.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Questionnaire slug sanitization
-- ---------------------------------------------------------------------------
-- Mirrors feature/questionnaire/utils/slug.ts::sanitizeSlug:
--   trim → lowercase → spaces/underscores → "-" → strip non [a-z0-9.-] →
--   collapse repeated "-" → drop leading/trailing "-".
-- Only touches rows that actually need it.

UPDATE questionnaires
SET slug = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(lower(trim(slug)), '[\s_]+', '-', 'g'),
      '[^a-z0-9.\-]', '', 'g'
    ),
    '-+', '-', 'g'
  ),
  '(^-+)|(-+$)', '', 'g'
)
WHERE deleted_at IS NULL
  AND (
       slug ~ '\s'
    OR slug ~ '[^a-z0-9.\-]'
    OR slug LIKE '-%'
    OR slug LIKE '%-'
    OR slug LIKE '%--%'
  );
