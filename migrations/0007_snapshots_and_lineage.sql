-- 0007 — derived snapshots, health/forecast assessments, and lineage.
-- Authority: REQ-DATA-005 (as-of reconstruction), REQ-DATA-010 (lineage), ADR-0004 (provenance).
--
-- Every derived table carries rule_version and computed_at. A derived value with no rule version
-- is unreproducible, which defeats the whole temporal model.

CREATE TABLE financial.financial_snapshot (
  project_id                       TEXT NOT NULL,
  week                             CHAR(8) NOT NULL,
  correction_seq                   SMALLINT NOT NULL DEFAULT 0,
  computed_at                      TIMESTAMPTZ NOT NULL,
  rule_version                     TEXT NOT NULL,
  reporting_currency               financial.currency_code NOT NULL,
  fx_rate_type                     TEXT NOT NULL,
  cost_to_date                     financial.money_amount NOT NULL,
  estimate_to_complete             financial.money_amount NOT NULL,
  committed_future_cost            financial.money_amount NOT NULL,
  estimate_at_completion           financial.money_amount NOT NULL,
  forecast_revenue                 financial.money_amount NOT NULL,
  unsecured_upside                 financial.money_amount NOT NULL,
  forecast_gm_value                financial.money_amount NOT NULL,
  forecast_gm_percent              financial.ratio,           -- NULL = NOT_COMPUTABLE
  sold_gm_value                    financial.money_amount NOT NULL,
  gm_erosion_value                 financial.money_amount NOT NULL,
  cost_consumed_percent            financial.ratio,
  burn_gap                         financial.ratio,
  performance_implied_eac          financial.money_amount,    -- NULL below the maturity threshold
  etc_optimism_gap                 financial.money_amount,
  contingency_consumed_percent     financial.ratio,
  contingency_burn_gap             financial.ratio,
  risk_adjusted_gm_value           financial.money_amount NOT NULL,
  gm_value_at_risk                 financial.money_amount NOT NULL,
  -- MET-FIN-009 is carried through from financial.recognised_revenue_fact, NOT recomputed here.
  -- OQ-2 CLOSED (Phase 2 closure, Decision 1): recognition is a Finance accounting fact.
  recognised_revenue               financial.money_amount NOT NULL,
  actual_to_date_margin_percent    financial.ratio,
  synthetic                        BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, week, correction_seq),
  CHECK (week ~ '^\d{4}-W\d{2}$'),
  -- MET-FIN-008 identity, enforced at rest: EAC = ATD + ETC + committed.
  CHECK (estimate_at_completion = cost_to_date + estimate_to_complete + committed_future_cost),
  -- MET-FIN-024 identity.
  CHECK (forecast_gm_value = forecast_revenue - estimate_at_completion),
  -- MET-FIN-025 = -MET-FIN-017: erosion is the sign-flip of the bridge total.
  CHECK (gm_erosion_value = sold_gm_value - forecast_gm_value),
  -- TEST_STRATEGY §3.3 property: value at risk is never negative.
  CHECK (gm_value_at_risk >= 0)
);
REVOKE UPDATE, DELETE ON financial.financial_snapshot FROM gldi_app;
CREATE TRIGGER financial_snapshot_is_append_only
  BEFORE UPDATE OR DELETE ON financial.financial_snapshot
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE delivery.delivery_snapshot (
  project_id                       TEXT NOT NULL,
  week                             CHAR(8) NOT NULL,
  correction_seq                   SMALLINT NOT NULL DEFAULT 0,
  computed_at                      TIMESTAMPTZ NOT NULL,
  rule_version                     TEXT NOT NULL,
  reporting_currency               financial.currency_code NOT NULL,
  actual_physical_completion       financial.ratio NOT NULL CHECK (actual_physical_completion BETWEEN 0 AND 1),
  planned_physical_completion      financial.ratio NOT NULL CHECK (planned_physical_completion BETWEEN 0 AND 1),
  progress_variance                financial.ratio NOT NULL,
  planned_value                    financial.money_amount NOT NULL,
  earned_value                     financial.money_amount NOT NULL,
  cost_performance_index           financial.ratio,
  schedule_performance_index       financial.ratio,
  variance_at_completion           financial.money_amount NOT NULL,
  milestone_slippage_days          INTEGER NOT NULL,
  milestones_at_risk               SMALLINT NOT NULL,
  demonstrated_velocity            financial.ratio,
  required_future_velocity         financial.ratio,
  required_velocity_ratio          financial.ratio,
  required_productivity_improvement financial.ratio,
  replan_frequency                 SMALLINT NOT NULL DEFAULT 0,
  blocked_effort_hours             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scope_completion                 financial.ratio,          -- NULL while MC-8 is open
  synthetic                        BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, week, correction_seq),
  CHECK (progress_variance = actual_physical_completion - planned_physical_completion)
);
REVOKE UPDATE, DELETE ON delivery.delivery_snapshot FROM gldi_app;
CREATE TRIGGER delivery_snapshot_is_append_only
  BEFORE UPDATE OR DELETE ON delivery.delivery_snapshot
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE health.status_report (
  project_id    TEXT NOT NULL,
  reported_on   DATE NOT NULL,
  reported_rag  TEXT NOT NULL CHECK (reported_rag IN ('RED','AMBER','GREEN')),
  commentary    TEXT NOT NULL,
  reported_by   TEXT NOT NULL,
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, reported_on)
);

-- REQ-HLTH-007: actor, reason, timestamp and expiry are all NOT NULL. An override without an
-- expiry is a permanent silent adjustment.
CREATE TABLE health.rag_override (
  project_id  TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL,
  rag         TEXT NOT NULL CHECK (rag IN ('RED','AMBER','GREEN')),
  reason      TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  actor_id    TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  synthetic   BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, applied_at),
  CHECK (expires_at > applied_at)
);
REVOKE UPDATE, DELETE ON health.rag_override FROM gldi_app;
CREATE TRIGGER rag_override_is_immutable
  BEFORE UPDATE OR DELETE ON health.rag_override
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE health.health_assessment (
  project_id              TEXT NOT NULL,
  week                    CHAR(8) NOT NULL,
  correction_seq          SMALLINT NOT NULL DEFAULT 0,
  assessed_at             TIMESTAMPTZ NOT NULL,
  rule_version            TEXT NOT NULL,
  health_model_version    TEXT NOT NULL,
  composite_score         NUMERIC(6,3) CHECK (composite_score BETWEEN 0 AND 100),
  reported_rag            TEXT NOT NULL,
  system_assessed_rag     TEXT NOT NULL,
  effective_rag           TEXT NOT NULL,
  divergence              SMALLINT NOT NULL CHECK (divergence BETWEEN -2 AND 2),
  divergence_persistence  SMALLINT NOT NULL DEFAULT 0,
  synthetic               BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, week, correction_seq)
);
REVOKE UPDATE, DELETE ON health.health_assessment FROM gldi_app;
CREATE TRIGGER health_assessment_is_append_only
  BEFORE UPDATE OR DELETE ON health.health_assessment
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

-- Lineage: which snapshot rows an assessment actually read (REQ-DATA-010, AC-3).
CREATE TABLE health.assessment_evidence (
  project_id      TEXT NOT NULL,
  week            CHAR(8) NOT NULL,
  correction_seq  SMALLINT NOT NULL,
  source_context  TEXT NOT NULL,
  source_week     CHAR(8) NOT NULL,
  source_seq      SMALLINT NOT NULL,
  metric_id       TEXT,
  PRIMARY KEY (project_id, week, correction_seq, source_context, source_week, source_seq)
);

CREATE TABLE forecast.trajectory_assessment (
  project_id                   TEXT NOT NULL,
  week                         CHAR(8) NOT NULL,
  correction_seq               SMALLINT NOT NULL DEFAULT 0,
  assessed_at                  TIMESTAMPTZ NOT NULL,
  rule_version                 TEXT NOT NULL,
  window_weeks                 SMALLINT NOT NULL CHECK (window_weeks >= 2),
  health_slope                 NUMERIC(10,4),
  deteriorating                BOOLEAN,
  weeks_to_amber               NUMERIC(8,2),
  margin_slope                 NUMERIC(10,4),
  projected_outturn_margin     financial.ratio,
  signal_confluence            SMALLINT,
  intervention_window_weeks    NUMERIC(8,2),
  silent_deterioration_index   NUMERIC(6,3) CHECK (silent_deterioration_index BETWEEN 0 AND 100),
  synthetic                    BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, week, correction_seq)
);

CREATE TABLE data_quality.assessment (
  project_id                  TEXT NOT NULL,
  week                        CHAR(8) NOT NULL,
  correction_seq              SMALLINT NOT NULL DEFAULT 0,
  assessed_at                 TIMESTAMPTZ NOT NULL,
  rule_version                TEXT NOT NULL,
  completeness                financial.ratio,
  freshness_days              SMALLINT,
  consistency                 financial.ratio,
  source_coverage             financial.ratio,
  confidence_score            NUMERIC(6,3),
  confidence_band             TEXT CHECK (confidence_band IN ('HIGH','MEDIUM','LOW')),
  forecast_confidence_score   NUMERIC(6,3),
  synthetic                   BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, week, correction_seq)
);

-- Rules as data (ADR-0004 §5): thresholds and weights are rows, never code constants.
CREATE TABLE rules.rule_definition (
  rule_set_id     TEXT NOT NULL,
  version         TEXT NOT NULL,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  description     TEXT NOT NULL,
  PRIMARY KEY (rule_set_id, version)
);

CREATE TABLE rules.rule_parameter (
  rule_set_id  TEXT NOT NULL,
  version      TEXT NOT NULL,
  name         TEXT NOT NULL,
  value        TEXT,                -- NULL while blocked_by is set
  unit         TEXT NOT NULL,
  blocked_by   TEXT,                -- e.g. 'MC-3'
  PRIMARY KEY (rule_set_id, version, name),
  FOREIGN KEY (rule_set_id, version) REFERENCES rules.rule_definition(rule_set_id, version),
  CHECK (value IS NOT NULL OR blocked_by IS NOT NULL)
);

CREATE TABLE rules.metric_definition (
  metric_id                  TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  business_definition        TEXT NOT NULL,
  formula                    TEXT NOT NULL,
  unit                       TEXT NOT NULL,
  layer                      TEXT NOT NULL CHECK (layer IN ('L1','L2','L3')),
  source_domain              TEXT NOT NULL,
  owner                      TEXT NOT NULL,
  aggregation                TEXT NOT NULL,
  currency_behaviour         TEXT NOT NULL,
  applicable_contract_types  TEXT[] NOT NULL,
  baseline                   TEXT,
  rule_set                   TEXT,
  effective_from             DATE NOT NULL,
  version                    TEXT NOT NULL,
  status                     TEXT NOT NULL CHECK (status IN ('Draft','Frozen','Implemented','Retired'))
);

CREATE TABLE rules.metric_version (
  metric_id       TEXT NOT NULL,
  version         TEXT NOT NULL,
  effective_from  DATE NOT NULL,
  formula         TEXT NOT NULL,
  supersedes      TEXT,
  change_reason   TEXT NOT NULL,
  PRIMARY KEY (metric_id, version)
);
REVOKE UPDATE, DELETE ON rules.metric_version FROM gldi_app;
CREATE TRIGGER metric_version_is_immutable
  BEFORE UPDATE OR DELETE ON rules.metric_version
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
