-- 0005 — financial facts and FX.
-- Authority: REQ-DATA-006 (currency explicit, FX dated), REQ-FIN-001 (decimal-safe), ADR-0002.
--
-- Every monetary column is NUMERIC via the financial.money_amount domain, and every one is
-- accompanied by an explicit currency_code. A money column with no currency beside it is a defect.

CREATE TABLE financial.fx_rate (
  id              TEXT PRIMARY KEY,
  from_currency   financial.currency_code NOT NULL,
  to_currency     financial.currency_code NOT NULL,
  rate            financial.rate_amount NOT NULL CHECK (rate > 0),
  rate_type       TEXT NOT NULL CHECK (rate_type IN ('SPOT','MONTHLY_AVERAGE','BUDGET','CLOSING')),
  effective_date  DATE NOT NULL,
  source          TEXT NOT NULL,
  synthetic       BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  UNIQUE (from_currency, to_currency, rate_type, effective_date),
  CHECK (from_currency <> to_currency)
);
REVOKE UPDATE, DELETE ON financial.fx_rate FROM gldi_app;
CREATE TRIGGER fx_rate_is_immutable
  BEFORE UPDATE OR DELETE ON financial.fx_rate
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE financial.actual_cost (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  period_end     DATE NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('LABOUR','NON_LABOUR','PASS_THROUGH','TRAVEL','LICENCE')),
  amount         financial.money_amount NOT NULL,
  currency_code  financial.currency_code NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL,     -- distinct from period_end, so late entry is detectable
  synthetic      BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);
CREATE INDEX ON financial.actual_cost (project_id, period_end);

CREATE TABLE financial.etc_line_item (
  project_id            TEXT NOT NULL,
  forecast_revision_id  TEXT NOT NULL,
  category              TEXT NOT NULL,
  amount                financial.money_amount NOT NULL CHECK (amount >= 0),
  currency_code         financial.currency_code NOT NULL,
  basis_of_estimate     TEXT NOT NULL CHECK (length(trim(basis_of_estimate)) > 0),
  estimated_by          TEXT NOT NULL,
  estimated_on          DATE NOT NULL,
  synthetic             BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, forecast_revision_id, category)
);

CREATE TABLE financial.commitment (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  amount             financial.money_amount NOT NULL CHECK (amount >= 0),
  currency_code      financial.currency_code NOT NULL,
  committed_on       DATE NOT NULL,
  expected_incur_by  DATE NOT NULL,
  cancellable        BOOLEAN NOT NULL,
  reference          TEXT NOT NULL,
  synthetic          BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE financial.contingency_drawdown (
  project_id     TEXT NOT NULL,
  drawn_on       DATE NOT NULL,
  amount         financial.money_amount NOT NULL CHECK (amount > 0),
  currency_code  financial.currency_code NOT NULL,
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  authorised_by  TEXT NOT NULL,
  synthetic      BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, drawn_on, reason)
);

-- ---------------------------------------------------------------------------
-- Recognised revenue — an imported accounting fact (Phase 2 closure, Decision 1).
-- OQ-2 CLOSED: Delivery Intelligence consumes the recognised amount from Finance/ERP and does not
-- recreate the accounting ledger. There is deliberately no column here derived from physical
-- completion or from Performance-Implied EAC, and no trigger that computes the amount.
-- ---------------------------------------------------------------------------
-- Insert-once is not "history can never change" (Phase 3 correction, Correction 6). A posting is
-- immutable; the effective position for a period changes through further authoritative postings that
-- name what they supersede. The primary key is the posting, not the period, precisely so a period
-- can carry an original and its corrections.
CREATE TABLE financial.recognised_revenue_fact (
  id                          TEXT PRIMARY KEY,
  project_id                  TEXT NOT NULL,
  reporting_period_id         TEXT NOT NULL,
  posting_type                TEXT NOT NULL
                                CHECK (posting_type IN ('ORIGINAL','ADJUSTMENT','REVERSAL','RESTATEMENT')),
  -- Signed: an adjustment or reversal is negative. The effective period figure is the sum of the
  -- live postings, which is why this column may go below zero and cumulative_amount may not.
  period_amount               financial.money_amount NOT NULL,
  cumulative_amount           financial.money_amount NOT NULL,
  currency_code               financial.currency_code NOT NULL,
  supersedes_fact_id          TEXT REFERENCES financial.recognised_revenue_fact(id),
  original_fact_id            TEXT REFERENCES financial.recognised_revenue_fact(id),
  -- Source lineage: which ledger record, and which version of it, this posting reflects.
  source_record_id            TEXT NOT NULL,
  source_version              TEXT NOT NULL,
  -- Which accounting policy produced the figure. For the POC this is RECOGNITION-v1, the documented
  -- synthetic policy; in production it is whatever Finance states.
  recognition_policy_version  TEXT NOT NULL,
  posting_reference           TEXT NOT NULL,
  source_timestamp            TIMESTAMPTZ NOT NULL,
  ingested_at                 TIMESTAMPTZ NOT NULL,
  synthetic                   BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  UNIQUE (source_record_id, source_version),
  CHECK (cumulative_amount >= 0),
  -- An ORIGINAL starts a chain; everything else must name what it corrects.
  CHECK ((posting_type = 'ORIGINAL' AND supersedes_fact_id IS NULL)
      OR (posting_type <> 'ORIGINAL' AND supersedes_fact_id IS NOT NULL)),
  -- A posting cannot supersede itself.
  CHECK (supersedes_fact_id IS NULL OR supersedes_fact_id <> id)
);
-- An accounting fact is not ours to amend. A restatement is a new posting from Finance, inserted
-- alongside the one it corrects — never an update to it.
REVOKE UPDATE, DELETE ON financial.recognised_revenue_fact FROM gldi_app;
CREATE TRIGGER recognised_revenue_fact_is_immutable
  BEFORE UPDATE OR DELETE ON financial.recognised_revenue_fact
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE INDEX ON financial.recognised_revenue_fact (project_id, reporting_period_id, source_timestamp);
CREATE INDEX ON financial.recognised_revenue_fact (supersedes_fact_id);
CREATE INDEX ON financial.recognised_revenue_fact (original_fact_id);
