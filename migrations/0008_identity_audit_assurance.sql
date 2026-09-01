-- 0008 — identity, audit and assurance.
-- Authority: REQ-SEC-001, REQ-SEC-006/007, SECURITY_MODEL.md §5.

CREATE TABLE identity.app_user (
  actor_id      TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN
                  ('EXECUTIVE','PORTFOLIO_DIRECTOR','DELIVERY_MANAGER','FINANCE_CONTROLLER',
                   'ASSURANCE_AUDITOR','SECURITY_ADMIN')),
  active_from   DATE NOT NULL,
  active_to     DATE,
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE identity.scope_grant (
  actor_id    TEXT NOT NULL REFERENCES identity.app_user(actor_id),
  node_kind   TEXT NOT NULL CHECK (node_kind IN ('BUSINESS_UNIT','GEOGRAPHY','PORTFOLIO','ACCOUNT','PROJECT')),
  node_id     TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL,
  granted_by  TEXT NOT NULL,
  revoked_at  TIMESTAMPTZ,
  reason      TEXT NOT NULL,
  PRIMARY KEY (actor_id, node_kind, node_id, granted_at)
);

CREATE TABLE identity.session (
  session_id       TEXT PRIMARY KEY,
  actor_id         TEXT NOT NULL REFERENCES identity.app_user(actor_id),
  issued_at        TIMESTAMPTZ NOT NULL,
  absolute_expiry  TIMESTAMPTZ NOT NULL,
  idle_expiry      TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  CHECK (absolute_expiry > issued_at)
);

-- SECURITY_MODEL.md §5.2, field for field. Append-only is a privilege, not a promise (§5.3).
CREATE TABLE audit.audit_event (
  id               TEXT PRIMARY KEY,
  occurred_at      TIMESTAMPTZ NOT NULL,
  actor_id         TEXT NOT NULL,
  actor_role       TEXT NOT NULL,
  impersonator_id  TEXT,
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  fields           TEXT[] NOT NULL DEFAULT '{}',
  decision         TEXT NOT NULL CHECK (decision IN ('GRANT','DENY')),
  reason           TEXT,
  correlation_id   TEXT NOT NULL,
  rule_version     TEXT,
  source_ip        INET NOT NULL,
  user_agent       TEXT NOT NULL
);
REVOKE UPDATE, DELETE ON audit.audit_event FROM gldi_app;
GRANT  SELECT, INSERT ON audit.audit_event TO   gldi_app;
CREATE TRIGGER audit_event_is_append_only
  BEFORE UPDATE OR DELETE ON audit.audit_event
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE INDEX ON audit.audit_event (actor_id, occurred_at DESC);
CREATE INDEX ON audit.audit_event (entity_type, entity_id, occurred_at DESC);
CREATE INDEX ON audit.audit_event (correlation_id);

CREATE TABLE assurance.review (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  conducted_on  DATE NOT NULL,
  reviewer_id   TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('GATE','DEEP_DIVE','COMMERCIAL','QUALITY','RECOVERY')),
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE assurance.finding (
  review_id    TEXT NOT NULL REFERENCES assurance.review(id),
  description  TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('CRITICAL','MAJOR','MINOR','OBSERVATION')),
  owner_id     TEXT NOT NULL,
  due_on       DATE,
  closed_on    DATE,
  PRIMARY KEY (review_id, description)
);

-- The durable record that a citation resolved to something real at assessment time — what makes
-- AC-3 answerable months later, after the underlying snapshot has been corrected.
CREATE TABLE assurance.evidence_record (
  id            TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL,
  subject_id    TEXT NOT NULL,
  metric_id     TEXT,
  ref_context   TEXT NOT NULL,
  ref_entity    TEXT NOT NULL,
  ref_id        TEXT NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL,
  content_hash  TEXT NOT NULL,
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);
REVOKE UPDATE, DELETE ON assurance.evidence_record FROM gldi_app;
CREATE TRIGGER evidence_record_is_immutable
  BEFORE UPDATE OR DELETE ON assurance.evidence_record
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE INDEX ON assurance.evidence_record (subject_type, subject_id);
