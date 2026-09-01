-- 0003 — project identity, portfolio membership, and the weekly snapshot spine.
-- Authority: REQ-DATA-001, REQ-DATA-005, ADR-0003 §Decision 3.

CREATE TABLE portfolio.portfolio (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  organization_node_id  TEXT NOT NULL,     -- opaque: no cross-schema FK
  synthetic             BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE portfolio.program (
  id            TEXT PRIMARY KEY,
  portfolio_id  TEXT NOT NULL REFERENCES portfolio.portfolio(id),
  name          TEXT NOT NULL,
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE portfolio.membership (
  portfolio_id    TEXT NOT NULL REFERENCES portfolio.portfolio(id),
  program_id      TEXT REFERENCES portfolio.program(id),
  project_id      TEXT NOT NULL,
  effective_from  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (portfolio_id, project_id, effective_from)
);

CREATE TABLE project.project (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  account_id            TEXT NOT NULL,
  organization_node_id  TEXT NOT NULL,
  portfolio_id          TEXT NOT NULL,
  contract_id           TEXT NOT NULL,
  engagement_model      TEXT NOT NULL CHECK (engagement_model IN ('FIXED_BID','TIME_AND_MATERIALS','CAPACITY')),
  lifecycle_stage       TEXT NOT NULL CHECK (lifecycle_stage IN ('INITIATING','EXECUTING','CLOSING','CLOSED')),
  lifecycle_sub_stage   TEXT NOT NULL CHECK (lifecycle_sub_stage IN
                          ('MOBILIZATION','EARLY_EXECUTION','MID_PROJECT','LATE_STAGE','UAT_ACCEPTANCE','CLOSED_OUT')),
  start_date            DATE NOT NULL,
  planned_end_date      DATE NOT NULL,
  in_recovery           BOOLEAN NOT NULL DEFAULT FALSE,
  synthetic             BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (planned_end_date >= start_date)
);

-- The weekly snapshot spine. Unique on (project, week, correction_seq) — ADR-0003 §Decision 3.
-- correction_seq = 0 is the original write; > 0 is a correction that must name what it corrects.
CREATE TABLE project.project_snapshot (
  project_id         TEXT NOT NULL REFERENCES project.project(id),
  week               CHAR(8) NOT NULL,            -- ISO week, e.g. 2026-W36
  correction_seq     SMALLINT NOT NULL DEFAULT 0,
  captured_at        TIMESTAMPTZ NOT NULL,
  lifecycle_stage    TEXT NOT NULL,
  corrects           SMALLINT,
  correction_reason  TEXT,
  synthetic          BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (project_id, week, correction_seq),
  CHECK (week ~ '^\d{4}-W\d{2}$'),
  CHECK ((correction_seq = 0 AND corrects IS NULL AND correction_reason IS NULL)
      OR (correction_seq > 0 AND corrects IS NOT NULL AND correction_reason IS NOT NULL))
);
REVOKE UPDATE, DELETE ON project.project_snapshot FROM gldi_app;
CREATE TRIGGER project_snapshot_is_append_only
  BEFORE UPDATE OR DELETE ON project.project_snapshot
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE INDEX ON project.project_snapshot (project_id, week DESC);
