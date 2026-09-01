-- 0004 — contract, the three baselines, and change records.
-- Authority: ADR-0003 (three baselines, append-only), REQ-DATA-002/003/004.
--
-- The three baselines are three TABLES, not one table with a type discriminator, "because that
-- shape invites UPDATE baseline SET … WHERE type = 'as_sold'" (ADR-0003 §Decision 1).

CREATE TABLE contract.contract (
  id                          TEXT PRIMARY KEY,
  project_id                  TEXT NOT NULL,     -- opaque; no cross-schema FK (ADR-0001 §3)
  customer_id                 TEXT NOT NULL,
  contract_type               TEXT NOT NULL CHECK (contract_type IN ('FIXED_BID','TIME_AND_MATERIALS','CAPACITY')),
  signed_on                   DATE NOT NULL,
  planned_start               DATE NOT NULL,
  planned_end                 DATE NOT NULL,
  liquidated_damages_per_day  financial.money_amount,
  liquidated_damages_cap      financial.money_amount,
  ld_currency                 financial.currency_code,
  acceptance_term_days        INTEGER,
  synthetic                   BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (planned_end >= planned_start)
);

-- ---------------------------------------------------------------------------
-- Original As-Sold Baseline — IMMUTABLE. Two independent controls.
-- ---------------------------------------------------------------------------
CREATE TABLE contract.as_sold_baseline (
  contract_id           TEXT PRIMARY KEY REFERENCES contract.contract(id),
  signed_on             DATE NOT NULL,
  contract_value        financial.money_amount NOT NULL CHECK (contract_value >= 0),
  budgeted_cost         financial.money_amount NOT NULL CHECK (budgeted_cost >= 0),
  contingency_budget    financial.money_amount NOT NULL CHECK (contingency_budget >= 0),
  currency_code         financial.currency_code NOT NULL,
  planned_completion    DATE NOT NULL,
  pyramid_ratio         financial.rate_amount NOT NULL,
  blended_rate          financial.money_amount NOT NULL,
  rework_allowance      financial.ratio NOT NULL CHECK (rework_allowance BETWEEN 0 AND 1),
  planned_effort_hours  NUMERIC(14, 2) NOT NULL CHECK (planned_effort_hours >= 0),
  synthetic             BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

-- Control 1 of 2: the application role simply cannot mutate these rows.
REVOKE UPDATE, DELETE ON contract.as_sold_baseline FROM gldi_app;
GRANT  SELECT, INSERT ON contract.as_sold_baseline TO   gldi_app;

-- Control 2 of 2: even the owner is stopped, and the error explains why.
CREATE TRIGGER as_sold_baseline_is_immutable
  BEFORE UPDATE OR DELETE ON contract.as_sold_baseline
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

-- ---------------------------------------------------------------------------
-- Executed vs pending changes — structurally distinct (REQ-DATA-004).
-- ---------------------------------------------------------------------------
CREATE TABLE contract.executed_change (
  id                        TEXT PRIMARY KEY,
  contract_id               TEXT NOT NULL REFERENCES contract.contract(id),
  executed_on               DATE NOT NULL,
  value_delta               financial.money_amount NOT NULL,
  cost_delta                financial.money_amount NOT NULL,
  contingency_delta         financial.money_amount NOT NULL DEFAULT 0,
  currency_code             financial.currency_code NOT NULL,
  scope_units_delta         NUMERIC(14, 2),
  completion_date_delta     INTEGER NOT NULL DEFAULT 0,
  executed_from_pending_id  TEXT,
  synthetic                 BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);
REVOKE UPDATE, DELETE ON contract.executed_change FROM gldi_app;
CREATE TRIGGER executed_change_is_immutable
  BEFORE UPDATE OR DELETE ON contract.executed_change
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE contract.pending_change (
  id                          TEXT PRIMARY KEY,
  contract_id                 TEXT NOT NULL REFERENCES contract.contract(id),
  raised_on                   DATE NOT NULL,
  proposed_value              financial.money_amount NOT NULL,
  estimated_cost              financial.money_amount NOT NULL,
  currency_code               financial.currency_code NOT NULL,
  approval_probability        financial.ratio NOT NULL CHECK (approval_probability BETWEEN 0 AND 1),
  probability_assessed_by     TEXT NOT NULL,
  probability_assessed_on     DATE NOT NULL,
  -- Set when an ExecutedChange was created FROM this record. The pending row is never
  -- status-flipped in place, so its ageing survives execution (ADR-0003 §Decision 2, MET-COM-007).
  superseded_by_executed_id   TEXT REFERENCES contract.executed_change(id),
  synthetic                   BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

-- There is deliberately NO status column on pending_change. A status column is precisely the
-- mechanism by which "UPDATE pending_change SET status='executed'" moves unsecured revenue into
-- the forecast in one statement (REQ-FIN-005).

CREATE TABLE contract.baseline_revision (
  id             TEXT PRIMARY KEY,
  contract_id    TEXT NOT NULL REFERENCES contract.contract(id),
  baseline_kind  TEXT NOT NULL CHECK (baseline_kind IN ('FORECAST','RECOVERY')),
  effective_from TIMESTAMPTZ NOT NULL,
  forecast_completion DATE,
  forecast_cost  financial.money_amount,
  currency_code  financial.currency_code,
  actor_id       TEXT NOT NULL,
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  supersedes     TEXT REFERENCES contract.baseline_revision(id),
  synthetic      BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);
REVOKE UPDATE, DELETE ON contract.baseline_revision FROM gldi_app;
CREATE TRIGGER baseline_revision_is_immutable
  BEFORE UPDATE OR DELETE ON contract.baseline_revision
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE contract.scope_baseline (
  id                     TEXT PRIMARY KEY,
  contract_id            TEXT NOT NULL REFERENCES contract.contract(id),
  baseline_kind          TEXT NOT NULL CHECK (baseline_kind IN ('AS_SOLD','CURRENT_CONTRACTUAL')),
  -- NULL while MC-8 is open. A NULL here means "undefined", not "zero".
  total_scope_units      NUMERIC(14, 2),
  scope_unit_definition  TEXT
);

CREATE INDEX ON contract.executed_change (contract_id, executed_on);
CREATE INDEX ON contract.pending_change  (contract_id, raised_on);
