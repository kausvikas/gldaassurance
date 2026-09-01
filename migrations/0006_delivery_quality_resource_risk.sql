-- 0006 — delivery, quality, resource and risk facts.
-- Authority: REQ-DATA-001.

CREATE TABLE delivery.milestone (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  baseline_date   DATE NOT NULL,
  forecast_date   DATE NOT NULL,
  actual_date     DATE,
  payment_gating  BOOLEAN NOT NULL DEFAULT FALSE,
  gated_value     financial.money_amount,
  currency_code   financial.currency_code,
  synthetic       BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (NOT payment_gating OR (gated_value IS NOT NULL AND currency_code IS NOT NULL))
);

CREATE TABLE delivery.scope_item (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  scope_baseline_id  TEXT,
  description        TEXT NOT NULL,
  completed_on       DATE,
  uncontracted       BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_value    financial.money_amount,
  currency_code      financial.currency_code,
  synthetic          BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

-- A recorded claim, with who made it and on what basis. Its reliability is measured, not assumed.
CREATE TABLE delivery.progress_claim (
  project_id           TEXT NOT NULL,
  claimed_on           DATE NOT NULL,
  physical_completion  financial.ratio NOT NULL CHECK (physical_completion BETWEEN 0 AND 1),
  basis                TEXT NOT NULL CHECK (length(trim(basis)) > 0),
  claimed_by           TEXT NOT NULL,
  synthetic            BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, claimed_on)
);

CREATE TABLE delivery.dependency (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  description  TEXT NOT NULL,
  owner        TEXT NOT NULL CHECK (owner IN ('CUSTOMER','THIRD_PARTY','INTERNAL')),
  raised_on    DATE NOT NULL,
  due_on       DATE NOT NULL,
  resolved_on  DATE,
  blocking     BOOLEAN NOT NULL DEFAULT FALSE,
  synthetic    BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE quality.defect (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('CRITICAL','MAJOR','MINOR','TRIVIAL')),
  raised_on        DATE NOT NULL,
  closed_on        DATE,
  discovery_phase  TEXT NOT NULL CHECK (discovery_phase IN ('PRE_RELEASE','POST_RELEASE')),
  escaped_to_client BOOLEAN NOT NULL DEFAULT FALSE,
  reopen_count     SMALLINT NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  synthetic        BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (closed_on IS NULL OR closed_on >= raised_on)
);

CREATE TABLE quality.acceptance_item (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  milestone_id      TEXT,
  submitted_on      DATE NOT NULL,
  accepted_on       DATE,
  blocking          BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_on       DATE,
  client_reference  TEXT NOT NULL,
  synthetic         BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (accepted_on IS NULL OR accepted_on >= submitted_on)
);

CREATE TABLE quality.release_record (
  project_id   TEXT NOT NULL,
  released_on  DATE NOT NULL,
  failed       BOOLEAN NOT NULL DEFAULT FALSE,
  synthetic    BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, released_on)
);

-- PERSONAL_DATA (SECURITY_MODEL.md §4.3). person_ref is a synthetic persona reference.
CREATE TABLE resource.assignment (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  person_ref         TEXT NOT NULL,
  seniority_band     TEXT NOT NULL CHECK (seniority_band IN ('PRINCIPAL','SENIOR','MID','JUNIOR','TRAINEE')),
  started_on         DATE NOT NULL,
  ended_on           DATE,
  allocation_percent financial.ratio NOT NULL CHECK (allocation_percent BETWEEN 0 AND 1),
  synthetic          BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE resource.effort_record (
  project_id               TEXT NOT NULL,
  assignment_id            TEXT NOT NULL REFERENCES resource.assignment(id),
  period_end               DATE NOT NULL,
  hours                    NUMERIC(10, 2) NOT NULL CHECK (hours >= 0),
  billable                 BOOLEAN NOT NULL,
  is_rework                BOOLEAN NOT NULL DEFAULT FALSE,
  caused_by_defect_id      TEXT,
  blocked_by_dependency_id TEXT,
  recorded_at              TIMESTAMPTZ NOT NULL,
  synthetic                BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (assignment_id, period_end, is_rework)
);

CREATE TABLE resource.open_role (
  project_id      TEXT NOT NULL,
  seniority_band  TEXT NOT NULL,
  opened_on       DATE NOT NULL,
  filled_on       DATE,
  synthetic       BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, seniority_band, opened_on)
);

CREATE TABLE risk.risk (
  id                             TEXT PRIMARY KEY,
  project_id                     TEXT NOT NULL,
  description                    TEXT NOT NULL,
  severity                       TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  probability                    financial.ratio NOT NULL CHECK (probability BETWEEN 0 AND 1),
  cost_impact                    financial.money_amount NOT NULL CHECK (cost_impact >= 0),
  currency_code                  financial.currency_code NOT NULL,
  -- The flag that prevents double counting in MET-RSK-008 / MET-FIN-032. Justification is
  -- required when it is TRUE, so "already in ETC" is a decision rather than a default.
  included_in_etc                BOOLEAN NOT NULL DEFAULT FALSE,
  included_in_etc_justification  TEXT,
  proximity_date                 DATE NOT NULL,
  state                          TEXT NOT NULL CHECK (state IN ('OPEN','MITIGATING','MITIGATED','ACCEPTED','REALISED')),
  raised_on                      DATE NOT NULL,
  updated_at                     TIMESTAMPTZ NOT NULL,
  synthetic                      BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (NOT included_in_etc OR length(trim(coalesce(included_in_etc_justification, ''))) > 0)
);

CREATE TABLE risk.mitigation (
  risk_id       TEXT NOT NULL REFERENCES risk.risk(id),
  description   TEXT NOT NULL,
  owner_id      TEXT NOT NULL,
  due_on        DATE NOT NULL,
  completed_on  DATE,
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (risk_id, description)
);

CREATE TABLE risk.intervention (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  description      TEXT NOT NULL,
  owner_id         TEXT NOT NULL,
  created_on       DATE NOT NULL,
  due_on           DATE NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PROPOSED','ACTIVE','COMPLETED','ABANDONED')),
  expected_effect  TEXT NOT NULL,
  observed_effect  TEXT,
  closed_on        DATE,
  synthetic        BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE INDEX ON delivery.milestone (project_id, baseline_date);
CREATE INDEX ON quality.defect (project_id, raised_on);
CREATE INDEX ON resource.effort_record (project_id, period_end);
CREATE INDEX ON risk.risk (project_id, state);
