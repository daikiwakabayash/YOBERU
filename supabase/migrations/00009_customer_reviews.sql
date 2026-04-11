-- 00009_customer_reviews.sql
--
-- Google / HotPepper 口コミ tracking on customers.
--
-- Two TIMESTAMPTZ columns (NULL = レビュー未受領, NON-NULL = 受領日時)
-- so we can both count the total number of 口コミを書いてくれた顧客 AND
-- figure out when the review was received if we ever want to chart it.
--
-- The UI checkboxes live in AppointmentDetailSheet under 合計会計 — once
-- a staff member ticks them for a customer, the state persists across
-- every future visit (it's stored on `customers`, not on `appointments`).
--
-- The 経営指標 (KPI) dashboard uses these columns for the「G口コミ」/
-- 「H口コミ」hero metrics.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS google_review_received_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hotpepper_review_received_at TIMESTAMPTZ;

-- Partial indexes: count(*) WHERE NOT NULL is the hot-path for the KPI
-- hero cards, and we expect only a small % of customers to have leaves
-- a review, so a partial index is both smaller and faster than a full
-- one.
CREATE INDEX IF NOT EXISTS idx_customers_google_review
  ON customers (shop_id)
  WHERE google_review_received_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_hotpepper_review
  ON customers (shop_id)
  WHERE hotpepper_review_received_at IS NOT NULL AND deleted_at IS NULL;
